import ToolsGd from '../tools/ToolsGd';
import ToolsDate from '../tools/ToolsDate';

export default class Contract {
  id?: number;
  alias?: string;
  typeId?: number;
  _type?: any;
  _tmpId?: any;
  number?: string;
  name?: string;
  _ourContract?: any;
  ourIdRelated?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  value?: any;
  comment?: string;
  ourId?: string;
  _ourType?: any;
  gdFolderId?: string;
  _gdFolderUrl?: string;
  meetingProtocolsGdFolderId?: string;
  materialCardsGdFolderId?: string;
  _ourIdName?: string;
  _numberName?: string;
  _ourIdOrNumber_Name?: string;
  _ourIdOrNumber_Alias?: string;
  _manager?: any;
  _admin?: any;
  _contractors?: any[];
  _engineers?: any[];
  _employers?: any[];
  contractUrl?: string;
  gdUrl?: string;
  status?: string;
  scrumSheet?: any;
  _parent?: any;

  constructor(initParamObject: any, conn?: GoogleAppsScript.JDBC.JdbcConnection) {
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
        if (initParamObject.ourId) throw new Error("Nie można powiązać ze sobą dwóch Umów ENVI!!!");

        this._ourContract = initParamObject._ourContract;
        this._ourContract.ourId = initParamObject._ourContract.ourId.toUpperCase();
        this._ourContract._ourType = this.getType(initParamObject._ourContract.ourId);
        this._ourContract._gdFolderUrl = ToolsGd.createGdFolderUrl(initParamObject._ourContract.gdFolderId);
        if (initParamObject._ourContract.name)
          this._ourContract._ourIdName = initParamObject._ourContract.ourId + ' ' + initParamObject._ourContract.name.substr(0, 50) + '...';
        this.ourIdRelated = initParamObject._ourContract.ourId;
      }
      if (initParamObject._ourContract) this.ourIdRelated = initParamObject._ourContract.ourId;
      this.projectId = initParamObject.projectId;
      this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate);
      this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate);

      this.value = initParamObject.value;
      this.comment = initParamObject.comment;

      if (initParamObject.ourId) {
        this.ourId = initParamObject.ourId.toUpperCase();
        this._ourType = this.getType(this.ourId as string);
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
      if (this.ourId) _ourIdOrNumber = this.ourId;
      else if (this.number) _ourIdOrNumber = this.number;

      if (this.name) {
        this._ourIdOrNumber_Name = _ourIdOrNumber + ' ' + this.name.substr(0, 50) + '...'
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

  getType(ourId: string): string {
    return ourId.substring(ourId.indexOf('.') + 1, ourId.lastIndexOf('.'));
  }
}