import { loadEnv } from '../src/setup/loadEnv';

type CompareResult = {
    name: string;
    equal: boolean;
    legacy: unknown;
    v2: unknown;
    rollback: unknown;
};

function normalizePerson(person: any) {
    if (!person) return null;
    return {
        id: person.id,
        name: person.name,
        surname: person.surname,
        position: person.position,
        email: person.email,
        cellphone: person.cellphone,
        phone: person.phone,
        comment: person.comment,
        systemEmail: person.systemEmail,
        systemRoleName: person.systemRoleName,
        systemRoleId: person.systemRoleId,
        entityId: person._entity?.id,
        entityName: person._entity?.name,
    };
}

function normalizeSystemRole(role: any) {
    if (!role) return null;
    return {
        id: role.id,
        name: role.name,
        personId: role.personId,
        googleId: role.googleId,
        microsofId: role.microsofId,
        googleRefreshToken: role.googleRefreshToken,
    };
}

function isEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

async function run() {
    loadEnv();
    const { default: PersonRepository } = await import(
        '../src/persons/PersonRepository'
    );

    const repository = new PersonRepository();
    const checks: CompareResult[] = [];

    process.env.PERSONS_MODEL_V2_READ_ENABLED = 'false';
    const seedPeople = await repository.find([]);
    const personWithSystemEmail = seedPeople.find((p) => !!p.systemEmail);
    if (!personWithSystemEmail?.id || !personWithSystemEmail.systemEmail) {
        throw new Error(
            'No seed person with systemEmail found. Cannot run P1-E parity checks.'
        );
    }

    const samplePersonId = personWithSystemEmail.id;
    const sampleSystemEmail = personWithSystemEmail.systemEmail;

    const legacyFindById = (await repository.find([{ id: samplePersonId }])).map(
        normalizePerson
    );
    const legacyFindBySystemEmail = (
        await repository.find([
            { systemEmail: sampleSystemEmail, showPrivateData: true },
        ])
    ).map(normalizePerson);
    const legacySystemRole = normalizeSystemRole(
        await repository.getSystemRole({ id: samplePersonId })
    );
    const legacyPersonBySystemEmail = normalizePerson(
        await repository.getPersonBySystemEmail(sampleSystemEmail)
    );

    process.env.PERSONS_MODEL_V2_READ_ENABLED = 'true';
    const v2FindById = (await repository.find([{ id: samplePersonId }])).map(
        normalizePerson
    );
    const v2FindBySystemEmail = (
        await repository.find([
            { systemEmail: sampleSystemEmail, showPrivateData: true },
        ])
    ).map(normalizePerson);
    const v2SystemRole = normalizeSystemRole(
        await repository.getSystemRole({ id: samplePersonId })
    );
    const v2PersonBySystemEmail = normalizePerson(
        await repository.getPersonBySystemEmail(sampleSystemEmail)
    );

    process.env.PERSONS_MODEL_V2_READ_ENABLED = 'false';
    const rollbackFindById = (
        await repository.find([{ id: samplePersonId }])
    ).map(normalizePerson);
    const rollbackFindBySystemEmail = (
        await repository.find([
            { systemEmail: sampleSystemEmail, showPrivateData: true },
        ])
    ).map(normalizePerson);
    const rollbackSystemRole = normalizeSystemRole(
        await repository.getSystemRole({ id: samplePersonId })
    );
    const rollbackPersonBySystemEmail = normalizePerson(
        await repository.getPersonBySystemEmail(sampleSystemEmail)
    );

    checks.push({
        name: 'find(by id)',
        equal:
            isEqual(legacyFindById, v2FindById) &&
            isEqual(legacyFindById, rollbackFindById),
        legacy: legacyFindById,
        v2: v2FindById,
        rollback: rollbackFindById,
    });
    checks.push({
        name: 'find(by systemEmail)',
        equal:
            isEqual(legacyFindBySystemEmail, v2FindBySystemEmail) &&
            isEqual(legacyFindBySystemEmail, rollbackFindBySystemEmail),
        legacy: legacyFindBySystemEmail,
        v2: v2FindBySystemEmail,
        rollback: rollbackFindBySystemEmail,
    });
    checks.push({
        name: 'getSystemRole',
        equal:
            isEqual(legacySystemRole, v2SystemRole) &&
            isEqual(legacySystemRole, rollbackSystemRole),
        legacy: legacySystemRole,
        v2: v2SystemRole,
        rollback: rollbackSystemRole,
    });
    checks.push({
        name: 'getPersonBySystemEmail',
        equal:
            isEqual(legacyPersonBySystemEmail, v2PersonBySystemEmail) &&
            isEqual(legacyPersonBySystemEmail, rollbackPersonBySystemEmail),
        legacy: legacyPersonBySystemEmail,
        v2: v2PersonBySystemEmail,
        rollback: rollbackPersonBySystemEmail,
    });

    const failed = checks.filter((check) => !check.equal);
    const summary = {
        samplePersonId,
        sampleSystemEmail,
        checks: checks.map((check) => ({
            name: check.name,
            equal: check.equal,
        })),
    };

    console.log(JSON.stringify(summary, null, 2));

    if (failed.length > 0) {
        console.error('P1-E parity check FAILED.');
        for (const failure of failed) {
            console.error(
                JSON.stringify(
                    {
                        name: failure.name,
                        legacy: failure.legacy,
                        v2: failure.v2,
                        rollback: failure.rollback,
                    },
                    null,
                    2
                )
            );
        }
        process.exitCode = 1;
        return;
    }

    console.log('P1-E parity check PASSED.');
}

run()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            const { default: ToolsDb } = await import('../src/tools/ToolsDb');
            await ToolsDb.pool.end();
        } catch (error) {
            console.error(error);
        }
    });
