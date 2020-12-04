"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ToolsGd_1 = __importDefault(require("../tools/ToolsGd"));
var ToolsDate_1 = __importDefault(require("../tools/ToolsDate"));
var Contract = /** @class */ (function () {
    function Contract(initParamObject, conn) {
        if (initParamObject) {
            this.id = initParamObject.id;
            this.alias = initParamObject.alias;
            this.typeId = initParamObject._type.id;
            this._type = initParamObject._type;
            //id tworzone tymczasowo po stronie klienta do obsługi tymczasowego wiersza resultsecie
            this._tmpId = initParamObject._tmpId;
            this.number = initParamObject.number;
            this.name = initParamObject.name;
            //kontrakt na roboty może być obsługiwany przez ourContract
            if (initParamObject._ourContract && initParamObject._ourContract.ourId) {
                if (initParamObject.ourId)
                    throw new Error("Nie można powiązać ze sobą dwóch Umów ENVI!!!");
                if (initParamObject._ourContract.ourId.indexOf(' ') > 0)
                    //TODO: linijka do usunięcia chyba
                    initParamObject.ourIdRelated = initParamObject.ourIdRelated.substring(0, initParamObject.ourIdRelated.indexOf(' '));
                this._ourContract = initParamObject._ourContract;
                this._ourContract.ourId = initParamObject._ourContract.ourId.toUpperCase();
                this._ourContract._ourType = this.getType(initParamObject._ourContract.ourId);
                this._ourContract._gdFolderUrl = ToolsGd_1.default.createGdFolderUrl(initParamObject._ourContract.gdFolderId);
                if (initParamObject._ourContract.name)
                    this._ourContract._ourIdName = initParamObject._ourContract.ourId + ' ' + initParamObject._ourContract.name.substr(0, 50) + '...';
                this.ourIdRelated = initParamObject._ourContract.ourId;
            }
            if (initParamObject._ourContract)
                this.ourIdRelated = initParamObject._ourContract.ourId;
            this.projectId = initParamObject.projectId;
            initParamObject.startDate = ToolsDate_1.default.dateJsToSql(initParamObject.startDate);
            initParamObject.endDate = ToolsDate_1.default.dateJsToSql(initParamObject.endDate);
            this.value = initParamObject.value;
            this.comment = initParamObject.comment;
            if (initParamObject.ourId) {
                this.ourId = initParamObject.ourId.toUpperCase();
                this._ourType = this.getType(this.ourId);
            }
            if (initParamObject.gdFolderId) {
                this.gdFolderId = initParamObject.gdFolderId;
                this._gdFolderUrl = 'https://drive.google.com/drive/folders/' + initParamObject.gdFolderId;
            }
            this.meetingProtocolsGdFolderId = initParamObject.meetingProtocolsGdFolderId;
            this.materialCardsGdFolderId = initParamObject.materialCardsGdFolderId;
            if (initParamObject.ourId && this.name)
                this._ourIdName = initParamObject.ourId + ' ' + initParamObject.name.substr(0, 50) + '...';
            else if (this.name)
                this._numberName = initParamObject.number + ' ' + initParamObject.name.substr(0, 50) + '...';
            //znacznik uniwersalny gdy chemy wybierać ze wszystkich kontraktów Our i Works
            var _ourIdOrNumber = '';
            if (this.ourId)
                _ourIdOrNumber = this.ourId;
            else if (this.number)
                _ourIdOrNumber = this.number;
            if (this.name) {
                this._ourIdOrNumber_Name = _ourIdOrNumber + ' ' + this.name.substr(0, 50) + '...';
            }
            this._ourIdOrNumber_Alias = _ourIdOrNumber;
            if (this.alias)
                this._ourIdOrNumber_Alias += ' ' + this.alias;
            this._manager = (initParamObject._manager) ? initParamObject._manager : {};
            this._admin = (initParamObject._admin) ? initParamObject._admin : {};
            this._contractors = (initParamObject._contractors) ? initParamObject._contractors : [];
            this._engineers = (initParamObject._engineers) ? initParamObject._engineers : [];
            this._employers = (initParamObject._employers) ? initParamObject._employers : [];
            this.contractUrl = initParamObject.contractUrl;
            this.gdUrl = initParamObject.gdUrl;
            this.status = initParamObject.status;
            //this.scrumSheet = new ScrumSheet();
        }
    }
    Contract.prototype.getType = function (ourId) {
        return ourId.substring(ourId.indexOf('.') + 1, ourId.lastIndexOf('.'));
    };
    return Contract;
}());
exports.default = Contract;
