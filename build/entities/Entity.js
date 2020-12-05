"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Entity = /** @class */ (function () {
    function Entity(initParamObject) {
        if (initParamObject) {
            this.id = initParamObject.id;
            if (initParamObject.name)
                this.name = initParamObject.name.trim();
            this.address = initParamObject.address;
            if (initParamObject.taxNumber)
                this.taxNumber = initParamObject.taxNumber;
            this.www = initParamObject.www;
            this.email = initParamObject.email;
            this.phone = initParamObject.phone;
            this.fax = initParamObject.fax;
        }
    }
    return Entity;
}());
exports.default = Entity;
