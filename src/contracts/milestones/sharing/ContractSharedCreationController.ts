import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import BaseController from '../../../controllers/BaseController';
import ToolsDb from '../../../tools/ToolsDb';
import { ProjectScope, UserData } from '../../../types/sessionTypes';
import Contract from '../../Contract';
import ContractOur from '../../ContractOur';
import ContractOther from '../../ContractOther';
import ContractRepository from '../../ContractRepository';
import ContractsController from '../../ContractsController';
import ContractEntityController from '../../ContractEntityController';
import ContractLeaderValidator from '../../ContractLeaderValidator';
import ContractRangeContractRepository from '../../contractRangesContracts/ContractRangeContractRepository';
import ContractTemplatesTreeController, { MilestoneSelectionItem } from '../../contractTemplatesTree/ContractTemplatesTreeController';
import { OptionalContractFolderKey, parseOptionalFoldersSelection } from '../../contractFolders/optionalContractFolders';
import MilestoneRepository from '../MilestoneRepository';
import MilestonesController from '../MilestonesController';
import Milestone from '../Milestone';
import { enqueueAqmPush, isAqmContractType, tryDeliverAfterCommit } from '../../aqmSync/AqmSync';
import { enqueueFidmanContractPush, isFidmanSyncEligible, tryDeliverAfterCommit as tryDeliverFidmanAfterCommit } from '../../fidmanSync/FidmanSync';
import Setup from '../../../setup/Setup';
import CurrentSprintValidator from '../../../ScrumSheet/CurrentSprintValidator';
import Sharing from './MilestoneSharingController';
import ShortcutController from './MilestoneShortcutController';
import SharingRepository from './MilestoneSharingRepository';
import SharingValidator from './MilestoneSharingValidator';
import SharingError from './MilestoneSharingError';
import ContractSelectedPersonsRepository from '../../ContractSelectedPersonsRepository';
import CreationValidator, { NewContractSharedMilestone } from './ContractCreationSharingValidator';

type CreationState = {
    stage: 'RESERVED' | 'FOLDERS_READY' | 'LINKED' | 'DOCUMENTS_PENDING' | 'DONE';
    ourId?: string;
    contractId?: number;
    folders?: { root: string; meetingProtocols?: string; materialCards?: string };
};

export type PreparedSharedCreation = {
    contract: ContractOur | ContractOther;
    selectedPersonIds?: number[];
    shared: NewContractSharedMilestone;
    own: MilestoneSelectionItem[];
    folders?: OptionalContractFolderKey[];
    actorId: number;
    requestId: string;
    payload: string;
    projectOurId: string;
    user: UserData;
    scope?: ProjectScope;
};

const repository = new SharingRepository();

export default class ContractSharedCreationController extends BaseController<ContractOur | ContractOther, ContractRepository> {
    private static instance: ContractSharedCreationController;
    private static getInstance() {
        if (!this.instance) this.instance = new ContractSharedCreationController();
        return this.instance;
    }
    constructor() { super(new ContractRepository()); }

    static async prepare(dto: any, user?: UserData, scope?: ProjectScope, selectedPersonIds?: number[]): Promise<PreparedSharedCreation | undefined> {
        const shared = CreationValidator.parse(dto?._milestonesSelection);
        if (!shared) return undefined;
        const requestId = CreationValidator.requestId(dto._creationRequestId);
        const payload = CreationValidator.fingerprint(dto);
        const own = ContractTemplatesTreeController.parseSelection(
            dto._milestonesSelection.filter((item: any) => item.mode !== 'shared')) || [];
        const folders = parseOptionalFoldersSelection(dto._contractFoldersSelection);
        SharingValidator.actor(user);

        return Sharing.runExclusive(async () => {
            const contract = await ContractsController.createContractFromDto({
                ...dto, _project: dto._project ? { ...dto._project } : dto._project,
            }, true);
            if (!contract.alias?.trim() || !contract.startDate || !contract.endDate)
                throw new SharingError('INVALID_REQUEST', 400);
            ContractLeaderValidator.validate(contract);
            const project = await repository.creationProject(SharingValidator.id(contract._project?.id));
            const type = await repository.creationContractType(SharingValidator.id(contract.typeId));
            if (!project || !type) throw new SharingError('OBJECT_NOT_FOUND', 404);
            if (Number(type.IsOur) !== Number(contract instanceof ContractOur))
                throw new SharingError('TYPE_MISMATCH');
            if (scope && !scope.projectOurIds.includes(project.OurId))
                throw new SharingError('SCOPE_DENIED', 403);
            contract.projectOurId = project.OurId;
            contract._project.gdFolderId = project.GdFolderId;

            if (own.length) {
                const resolved = await ContractTemplatesTreeController.resolveSelection(contract.typeId!, own);
                if (resolved.length !== own.length || resolved.some((item, index) =>
                    item.milestoneType.id !== own[index].milestoneTypeId ||
                    item.caseTypes.length !== new Set(own[index].caseTypeIds).size ||
                    item.caseTypes.some(caseItem => !own[index].caseTypeIds.includes(caseItem.caseType.id!))))
                    throw new SharingError('TYPE_UNAVAILABLE');
            }

            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                const receipt = await repository.creationReceipt(user!.enviId, requestId, conn);
                if (receipt) {
                    if (receipt.Payload !== payload) throw new SharingError('IDEMPOTENCY_CONFLICT');
                    const state = JSON.parse(receipt.Result) as CreationState;
                    this.restore(contract, state);
                    return;
                }
                if (await this.getInstance().repository.isUniquePerProject(contract))
                    throw new SharingError('DEPENDENCY_CONFLICT');
                await this.validateSource(shared, project.OurId, contract.typeId!, scope, conn);
                await repository.reserveCreation(user!.enviId, requestId, payload,
                    { stage: 'RESERVED', ourId: contract instanceof ContractOur ? contract.ourId : undefined }, conn);
            });
            return { contract, shared, own, folders, selectedPersonIds, actorId: user!.enviId,
                requestId, payload, projectOurId: project.OurId, user: user!, scope };
        });
    }

    static async addWithAuth(prepared: PreparedSharedCreation, taskId: string, auth?: OAuth2Client) {
        return this.withAuth(async (_instance, authClient) => this.add(prepared, authClient, taskId), auth);
    }

    static async add(prepared: PreparedSharedCreation, auth: OAuth2Client, taskId: string) {
        return Sharing.runExclusive(async () => {
            const { contract, actorId, requestId, payload, shared, projectOurId } = prepared;
            SharingValidator.actor(prepared.user);
            if (prepared.scope && !prepared.scope.projectOurIds.includes(projectOurId))
                throw new SharingError('SCOPE_DENIED', 403);
            const receipt = await repository.creationReceipt(actorId, requestId);
            if (!receipt || receipt.Payload !== payload) throw new SharingError('IDEMPOTENCY_CONFLICT');
            let state = JSON.parse(receipt.Result) as CreationState;
            this.restore(contract, state);
            if (state.stage === 'DONE') return { contract, shortcutStatus:
                (await repository.snapshot(shared.milestoneId)).links.find(l => l.ContractId === contract.id)?.ShortcutStatus };

            if (state.stage !== 'DOCUMENTS_PENDING' && Setup.scrumSheetSyncEnabled)
                await CurrentSprintValidator.checkColumns(auth);

            if (!state.contractId)
                await this.validateSource(shared, projectOurId, contract.typeId!, prepared.scope);
            if (!state.folders) {
                if (!contract._project?.gdFolderId) throw new SharingError('DEPENDENCY_CONFLICT');
                await contract.createFolders(auth, prepared.folders);
                state = { ...state, stage: 'FOLDERS_READY', folders: {
                    root: contract.gdFolderId!, meetingProtocols: contract.meetingProtocolsGdFolderId,
                    materialCards: contract instanceof ContractOther ? contract.materialCardsGdFolderId : undefined,
                } };
                await repository.updateCreation(actorId, requestId, state);
            }

            if (!state.contractId) {
                const contractRepository = this.getInstance().repository;
                const ranges = new ContractRangeContractRepository();
                let aqmOutboxId: number | undefined;
                let fidmanOutboxId: number | undefined;
                await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                    const current = await repository.creationReceipt(actorId, requestId, conn);
                    if (!current || current.Payload !== payload) throw new SharingError('IDEMPOTENCY_CONFLICT');
                    const saved = JSON.parse(current.Result) as CreationState;
                    if (saved.contractId) { state = saved; this.restore(contract, saved); return; }
                    await this.validateSource(shared, projectOurId, contract.typeId!, prepared.scope, conn);
                    if (await contractRepository.isUniquePerProject(contract))
                        throw new SharingError('DEPENDENCY_CONFLICT');
                    await contractRepository.addInDb(contract, conn, true);
                    await ContractEntityController.addAssociations(contract, conn);
                    if (prepared.selectedPersonIds?.length)
                        await ContractSelectedPersonsRepository.add(contract.id!, prepared.selectedPersonIds, conn);
                    if (contract._contractRangesPerContract?.length)
                        await ranges.addAssociations(contract, contract._contractRangesPerContract, conn);
                    if (isAqmContractType(contract.typeId)) aqmOutboxId = await enqueueAqmPush(contract, conn);
                    if (isFidmanSyncEligible(contract))
                        fidmanOutboxId = await enqueueFidmanContractPush(contract, conn);
                    await repository.attach(shared.milestoneId, contract.id!, conn);
                    await repository.touch(shared.milestoneId, conn);
                    state = { ...saved, stage: 'LINKED', contractId: contract.id };
                    await repository.updateCreation(actorId, requestId, state, conn);
                });
                if (aqmOutboxId !== undefined)
                    await tryDeliverAfterCommit(aqmOutboxId).catch(error => console.error('[AqmSync] shared creation:', error));
                if (fidmanOutboxId !== undefined)
                    await tryDeliverFidmanAfterCommit(fidmanOutboxId).catch(error => console.error('[FidmanSync] shared creation:', error));
            }

            this.restore(contract, state);
            if (state.stage !== 'DOCUMENTS_PENDING') {
                if (Setup.scrumSheetSyncEnabled && contract instanceof ContractOur)
                    await contract.editInScrum(auth);
                for (const selection of prepared.own)
                    await this.ensureOwnMilestone(contract, selection, auth, taskId);
                state = { ...state, stage: 'DOCUMENTS_PENDING' };
                await repository.updateCreation(actorId, requestId, state);
            }
            await ShortcutController.ensure(shared.milestoneId, contract.id!, auth);
            const link = (await repository.snapshot(shared.milestoneId)).links.find(l => l.ContractId === contract.id);
            if (link?.ShortcutStatus !== 'READY') throw new SharingError('SHORTCUT_NOT_READY', 503);
            state = { ...state, stage: 'DONE' };
            await repository.updateCreation(actorId, requestId, state);
            return { contract, shortcutStatus: link.ShortcutStatus };
        });
    }

    private static restore(contract: ContractOur | ContractOther, state: CreationState) {
        if (state.contractId) contract.id = state.contractId;
        if (state.ourId && contract instanceof ContractOur) {
            contract.ourId = state.ourId;
            contract.setFolderName();
        }
        if (state.folders) {
            contract.setGdFolderIdAndUrl(state.folders.root);
            contract.meetingProtocolsGdFolderId = state.folders.meetingProtocols;
            if (contract instanceof ContractOther) contract.materialCardsGdFolderId = state.folders.materialCards;
        }
    }

    private static async validateSource(shared: NewContractSharedMilestone, projectOurId: string,
        contractTypeId: number, scope?: ProjectScope, conn?: mysql.PoolConnection) {
        const snapshot = await repository.snapshot(shared.milestoneId, conn);
        SharingValidator.exists(snapshot.m);
        if (snapshot.m.TypeId !== 5 || snapshot.m.OfferId != null)
            throw new SharingError('TYPE_MISMATCH');
        SharingValidator.idle(snapshot.links);
        const ids = [snapshot.m.ContractId, ...snapshot.links.map((link: any) => link.ContractId)];
        const contracts = await repository.contracts(ids, conn);
        if (contracts.length !== new Set(ids).size ||
            contracts.some((item: any) => item.ProjectOurId !== projectOurId))
            throw new SharingError('CROSS_PROJECT');
        SharingValidator.scope(contracts, scope);
        SharingValidator.available(await repository.availability(5, contractTypeId, conn));
        SharingValidator.revision(shared.expectedRevision, Sharing.revision(snapshot));
    }

    private static async ensureOwnMilestone(contract: Contract, selection: MilestoneSelectionItem,
        auth: OAuth2Client, taskId: string) {
        const typeId = SharingValidator.id(selection.milestoneTypeId);
        if (typeId === 5) throw new SharingError('INVALID_REQUEST', 400);
        const existing = (await repository.ownedMilestones(contract.id!)).filter(row => row.TypeId === typeId);
        if (existing.length > 1) throw new SharingError('DEPENDENCY_CONFLICT');
        if (!existing.length) {
            const resolved = await ContractTemplatesTreeController.resolveSelection(contract.typeId!, [selection]);
            if (resolved.length !== 1) throw new SharingError('TYPE_UNAVAILABLE');
            const item = resolved[0];
            const milestone = new Milestone({
                name: item.name, description: item.description, _type: item.milestoneType,
                _contract: contract as any, status: 'Nie rozpoczęty',
                _dates: [{ startDate: contract.startDate!, endDate: contract.endDate!, milestoneId: 0 }],
            });
            if (!milestone._type.isUniquePerContract) milestone.number = 1;
            await MilestonesController.createFolders(milestone, auth);
            await new MilestoneRepository().addMilestonesWithDates([milestone]);
            await MilestonesController.createDefaultCases(milestone, auth, {
                isPartOfBatch: true, caseTypes: item.caseTypes,
            });
            return;
        }
        const resolved = await ContractTemplatesTreeController.resolveSelection(contract.typeId!, [selection]);
        if (resolved.length !== 1 || existing[0].Name !== resolved[0].name)
            throw new SharingError('DEPENDENCY_CONFLICT');
        const count = await repository.caseCount(existing[0].Id);
        if (count === resolved[0].caseTypes.length) return;
        if (count !== 0) throw new SharingError('DEPENDENCY_CONFLICT');
        const milestone = await new MilestoneRepository().findById(existing[0].Id);
        if (!milestone) throw new SharingError('OBJECT_NOT_FOUND', 404);
        await MilestonesController.createDefaultCases(milestone, auth, {
            isPartOfBatch: true, caseTypes: resolved[0].caseTypes,
        });
    }
}
