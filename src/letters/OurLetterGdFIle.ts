import DocumentTemplate from "../documentTemplates/DocumentTemplate";
import OurLetter from "./OurLetter";
import { OAuth2Client } from 'google-auth-library';
import DocumentGdFile from "../documentTemplates/DocumentGdFile";
import { Envi } from "../tools/Tools";
import ToolsDocs from "../tools/ToolsDocs";

export default class OurLetterGdFile extends DocumentGdFile {
    projectContext: string;
    constructor(initObjectParamenter: { _template: DocumentTemplate, document: OurLetter }) {
        super(initObjectParamenter);
        this.description = this.document.description;
        this.projectContext = 'projekt: ' + this.document._project.ourId + ', ' +
            this.makeCasesList();
        ;
    }

    /*
     * tworzy plik z szablonu w folderze pisma na GD
     */
    async create(auth: OAuth2Client) {
        const gDocument = await super.create(auth);
        ToolsDocs.fillNamedRange(gDocument, 'address', this.makeEntitiesDataLabel(<any[]>this.document._entitiesMain));
        ToolsDocs.fillNamedRange(gDocument, 'description', <string>this.description);
        var projectContextStyle = {};
        //projectContextStyle[DocumentApp.Attribute.FONT_SIZE] = 9;
        //projectContextStyle[DocumentApp.Attribute.FOREGROUND_COLOR] = '#666666';
        ToolsDocs.fillNamedRange(gDocument, 'projectContext', this.projectContext, projectContextStyle);
        return gDocument;
    }

    edit(auth: OAuth2Client) {
        /*
        super.edit(auth);
        GDocsTools.fillNamedRange(this.document.documentGdId, 'number', '' + this.document.number);
        GDocsTools.fillNamedRange(this.document.documentGdId, 'address', this.makeEntitiesDataLabel(this.document._entitiesMain));
        GDocsTools.fillNamedRange(this.document.documentGdId, 'description', this.description);
        var projectContextStyle = {};
        projectContextStyle[DocumentApp.Attribute.FONT_SIZE] = 10;
        projectContextStyle[DocumentApp.Attribute.FOREGROUND_COLOR] = '#b6bbb9';
        GDocsTools.fillNamedRange(this.document.documentGdId, 'projectContext', this.projectContext, projectContextStyle);
        */
    }

    private makeCasesList(): string {
        const cases = this.document._cases.map(item => {
            item.contractId = item._parent.contractId;
            return item;
        })
        let casesByContracts = Envi.ToolsArray.groupBy(cases, 'contractId')
        let casesLabel: string = '';
        for (const contractIdItem in casesByContracts) {
            casesLabel += 'kontrakt: '
            casesLabel += casesByContracts[contractIdItem][0]._parent._parent.ourId || casesByContracts[contractIdItem][0]._parent._parent.number;
            casesLabel += ' ' + casesByContracts[contractIdItem][0]._parent._parent.name + ', ';
            casesLabel += (casesByContracts[contractIdItem].length > 1) ? ' sprawy: ' : ' sprawa: ';
            for (const caseItem of casesByContracts[contractIdItem])
                casesLabel += caseItem._typeFolderNumber_TypeName_Number_Name + ', '
        }
        return casesLabel.substring(0, casesLabel.length - 2);
    }

    /** tworzy etykietę z danymi address
     */
    private makeEntitiesDataLabel(entities: any[]) {
        let label = '';
        for (var i = 0; i < entities.length; i++) {
            label += entities[i].name
            if (entities[i].address)
                label += '\n' + entities[i].address;
            if (i < entities.length - 1)
                label += '\n'
        }
        return label;
    }

}