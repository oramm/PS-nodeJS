/**
 * Podpięcie ISTNIEJĄCEGO typu kamienia pod kolejny typ umowy.
 *
 * Testujemy same bramki, bo to one decydują, czy do tabeli powiązań wejdzie wiersz,
 * którego nikt potem nie usunie bez skutków ubocznych. Zapis idzie jednym INSERT-em
 * i nie ma w nim logiki wartej sprawdzania.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import TypesTreeRepository from '../TypesTreeRepository';

jest.mock('../TypesTreeRepository');

import TypesTreeController from '../TypesTreeController';

const payload = {
    milestoneTypeId: 5,
    contractTypeId: 10,
    folderNumber: '09',
    isDefault: false,
};

describe('TypesTreeController.attachMilestoneTypeFromDto()', () => {
    let repository: any;

    beforeEach(() => {
        jest.clearAllMocks();
        repository = {
            findMilestoneTypes: jest.fn(() =>
                Promise.resolve([{ id: 5, name: 'Przetarg - obsługa' }] as any[])
            ),
            findOfferMilestoneTypes: jest.fn(() => Promise.resolve([] as any[])),
            findContractTypeMilestoneTypes: jest.fn(() =>
                Promise.resolve([] as any[])
            ),
            addContractTypeMilestoneTypeInDb: jest.fn(() => Promise.resolve()),
            // getTree() woła jeszcze te trzy - zwracamy puste, bo drzewo nie jest
            // przedmiotem tego testu.
            findContractTypes: jest.fn(() => Promise.resolve([] as any[])),
            findCaseTypes: jest.fn(() => Promise.resolve([] as any[])),
            findSubCaseTypeLinks: jest.fn(() => Promise.resolve([] as any[])),
        };
        (TypesTreeRepository as jest.Mock).mockImplementation(() => repository);
        // Repozytorium jest polem statycznym - podmieniamy je po zamockowaniu klasy
        (TypesTreeController as any).repository = repository;
    });

    it('zapisuje samo powiązanie i nie rusza typu', async () => {
        await TypesTreeController.attachMilestoneTypeFromDto(payload);

        expect(repository.addContractTypeMilestoneTypeInDb).toHaveBeenCalledWith(
            payload
        );
    });

    it('odmawia, gdy typ kamienia nie istnieje', async () => {
        repository.findMilestoneTypes.mockResolvedValue([]);

        await expect(
            TypesTreeController.attachMilestoneTypeFromDto(payload)
        ).rejects.toThrow(/nie istnieje/);
        expect(repository.addContractTypeMilestoneTypeInDb).not.toHaveBeenCalled();
    });

    it('odmawia dla kamienia ofertowego', async () => {
        // Gałąź ofert ma własną tabelę powiązań, a Setup rozpoznaje te typy po numerze.
        repository.findOfferMilestoneTypes.mockResolvedValue([
            { milestoneTypeId: 5, folderNumber: '01' },
        ]);

        await expect(
            TypesTreeController.attachMilestoneTypeFromDto(payload)
        ).rejects.toThrow(/ofertowe/);
        expect(repository.addContractTypeMilestoneTypeInDb).not.toHaveBeenCalled();
    });

    it('odmawia, gdy para już istnieje', async () => {
        // Unikalny indeks i tak by to odrzucił, ale komunikatem o naruszeniu klucza.
        repository.findContractTypeMilestoneTypes.mockResolvedValue([
            { milestoneTypeId: 5, contractTypeId: 10, folderNumber: '03', isDefault: false },
        ]);

        await expect(
            TypesTreeController.attachMilestoneTypeFromDto(payload)
        ).rejects.toThrow(/już podpięty/);
        expect(repository.addContractTypeMilestoneTypeInDb).not.toHaveBeenCalled();
    });
});
