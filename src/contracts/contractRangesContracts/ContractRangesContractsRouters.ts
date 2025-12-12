import { Request, Response } from 'express';
import ContractRangesContractsController from './ContractRangesController';
import { app } from '../../index';

/**
 * Router dla asocjacji ContractRange-Contract
 * Przepływ: Router → Controller → Repository → Model
 * Router NIE tworzy instancji Model - deleguje do Controller
 */

app.post(
    '/contractRangesContracts',
    async (req: Request, res: Response, next) => {
        try {
            const orConditions = req.body.orConditions;
            const result = await ContractRangesContractsController.find(
                orConditions
            );
            res.send(result);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                res.status(500).send({ errorMessage: error.message });
            }
        }
    }
);

app.post(
    '/contractRangeContract',
    async (req: Request, res: Response, next) => {
        try {
            const result = await ContractRangesContractsController.addFromDto(
                req.body
            );
            res.send(result);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                res.status(500).send({ errorMessage: error.message });
            }
        }
    }
);

app.put(
    '/contractRangeContract/:id',
    async (req: Request, res: Response, next) => {
        try {
            const result = await ContractRangesContractsController.editFromDto(
                req.body
            );
            res.send(result);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                res.status(500).send({ errorMessage: error.message });
            }
        }
    }
);

app.delete(
    '/contractRangeContract/:id',
    async (req: Request, res: Response) => {
        try {
            const result =
                await ContractRangesContractsController.deleteFromDto(req.body);
            res.send(result);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                res.status(500).send({ errorMessage: error.message });
            }
        }
    }
);
