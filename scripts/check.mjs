import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = resolve(import.meta.dirname, '..');
const ignorados = new Set(['.git', 'node_modules']);
const arquivos = [];
const erros = [];

async function listar(diretorio) {
  for (const nome of await readdir(diretorio)) {
    if (ignorados.has(nome)) continue;
    const caminho = join(diretorio, nome);
    const info = await stat(caminho);
    if (info.isDirectory()) await listar(caminho);
    else arquivos.push(caminho);
  }
}

await listar(raiz);

for (const arquivo of arquivos) {
  const conteudo = await readFile(arquivo, 'utf8');
  const relativo = arquivo.slice(raiz.length + 1);

  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(conteudo)) {
    erros.push(`${relativo}: marcador de conflito Git encontrado`);
  }

  if (extname(arquivo) === '.js' || extname(arquivo) === '.mjs') {
    const resultado = spawnSync(process.execPath, ['--check', arquivo], { encoding: 'utf8' });
    if (resultado.status !== 0) {
      erros.push(`${relativo}: ${resultado.stderr.trim()}`);
    }
  }

  if (extname(arquivo) === '.html') {
    const ids = [...conteudo.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
    for (const id of new Set(ids)) {
      if (ids.filter(valor => valor === id).length > 1) {
        erros.push(`${relativo}: id duplicado "${id}"`);
      }
    }

    const referencias = [...conteudo.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)]
      .map(m => m[1])
      .filter(ref => !/^(https?:|data:|mailto:|javascript:|\/)/.test(ref));

    for (const referencia of referencias) {
      if (!existsSync(resolve(dirname(arquivo), referencia))) {
        erros.push(`${relativo}: referência local ausente "${referencia}"`);
      }
    }
  }
}

if (erros.length) {
  console.error(erros.map(erro => `- ${erro}`).join('\n'));
  process.exit(1);
}

console.log(`Verificação concluída: ${arquivos.length} arquivos sem erros estruturais.`);
