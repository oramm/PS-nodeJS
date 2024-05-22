import { Request, Response } from 'express';
import ContractRangesController from './ContractRangesController';
import ContractRangeContract from './ContractRangeContract';
import { app } from '../../index';

app.post('/contractRangesContracts', async (req: Request, res: Response) => {
    try {
        const orConditions = req.body.orConditions; // zmiana z req.parsedBody na req.body
        const result =
            await ContractRangesController.getContractRangesContractsList(
                orConditions
            );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.post('/contractRangeContract', async (req: Request, res: Response) => {
    try {
        let contractRangeContract = new ContractRangeContract(req.body); // zmiana z req.parsedBody na req.body
        await contractRangeContract.addInDb();
        res.send(contractRangeContract);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/contractRangeContract/:id', async (req: Request, res: Response) => {
    try {
        let contractRangeContract = new ContractRangeContract(req.body); // zmiana z req.parsedBody na req.body
        await contractRangeContract.editInDb();
        res.send(contractRangeContract);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete(
    '/contractRangeContract/:id',
    async (req: Request, res: Response) => {
        try {
            let contractRangeContract = new ContractRangeContract(req.body);
            await contractRangeContract.deleteFromDb();
            res.send(contractRangeContract);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                res.status(500).send({ errorMessage: error.message });
            }
        }
    }
);
