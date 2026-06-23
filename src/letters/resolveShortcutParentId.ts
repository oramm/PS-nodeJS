import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../tools/ToolsGd';
import { CaseData } from '../types/types';

export async function resolveShortcutParentId(
    auth: OAuth2Client,
    caseItem: CaseData
): Promise<string> {
    if (caseItem._parent?._contract?.lettersShortcutsInSubfolder === true) {
        const subfolder = await ToolsGd.setFolder(auth, {
            parentId: caseItem.gdFolderId!,
            name: 'Pisma',
        });
        return subfolder.id!;
    }
    return caseItem.gdFolderId!;
}
