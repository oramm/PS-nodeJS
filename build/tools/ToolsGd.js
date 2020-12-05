"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ToolsGd = /** @class */ (function () {
    function ToolsGd() {
    }
    ToolsGd.createGdFolderUrl = function (gdFolderId) {
        if (gdFolderId)
            return 'https://drive.google.com/drive/folders/' + gdFolderId;
    };
    ToolsGd.createDocumentOpenUrl = function (gdDocumentId) {
        if (gdDocumentId)
            return 'https://drive.google.com/open?id=' + gdDocumentId;
    };
    ToolsGd.createDocumentEditUrl = function (gdDocumentId) {
        if (gdDocumentId)
            return 'https://docs.google.com/document/d/' + gdDocumentId + '/edit';
    };
    return ToolsGd;
}());
exports.default = ToolsGd;
