import { execFileSync } from 'child_process';
import { resolve } from 'path';

test('kopia kodu filtruje sekrety, dane testowe i dowiązania oraz zawiera lokalny ekran', () => {
    execFileSync(process.execPath, ['--test', resolve('scripts/pomoc-snapshot.test.mjs')], { stdio: 'pipe' });
});
