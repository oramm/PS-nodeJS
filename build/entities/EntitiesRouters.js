"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var EntitiesController_1 = __importDefault(require("./EntitiesController"));
var app = express_1.default();
app.get('/entities', function (req, res) {
    EntitiesController_1.default.getEntitiesList({}, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(EntitiesController_1.default.processEntitiesResult(result));
    });
});
app.get('/entity/:id', function (req, res) {
    EntitiesController_1.default.getEntitiesList(req.params, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(EntitiesController_1.default.processEntitiesResult(result));
    });
});
module.exports = app;
