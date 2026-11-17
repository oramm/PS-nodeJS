/** Storage fixture for older controller suites: real lifecycle policy, no shared links. */
export function installUnsharedLifecyclePool(toolsDb: any) {
    const query = async (sql: string, params: any[] = []) => {
        if (sql.includes('GET_LOCK')) return [[{ ok: 1 }], []];
        if (sql.includes('RELEASE_LOCK')) return [[{ ok: 1 }], []];
        if (sql.startsWith('SELECT * FROM Contracts WHERE Id IN'))
            return [params[0].map((Id: number) => ({ Id, ProjectOurId: 'synthetic' })), []];
        if (sql.includes('FROM MilestoneContractLinks l JOIN Milestones')) return [[], []];
        if (sql.includes('FROM MilestoneConsolidationOperations o') && sql.includes('JOIN Contracts c ON c.Id = m.ContractId')) return [[], []];
        if (sql.includes('FROM MilestoneConsolidationOperations o') && sql.includes('JOIN Projects p ON p.OurId = o.ProjectOurId')) return [[], []];
        throw new Error('Unexpected lifecycle fixture SQL: ' + sql);
    };
    Object.defineProperty(toolsDb, 'pool', { configurable: true, value: {
        query,
        getConnection: async () => ({ query, release() {}, destroy() {} }),
    } });
}
