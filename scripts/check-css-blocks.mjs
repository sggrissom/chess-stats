import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  }));
  return files.flat();
}

function inspectCss(css) {
  let depth = 0;
  let rules = 0;
  let quote = "";
  let comment = false;

  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    const next = css[index + 1];

    if (comment) {
      if (char === "*" && next === "/") {
        comment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "*") {
      comment = true;
      index++;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      if (depth === 0) rules++;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth < 0) return { rules, balanced: false };
    }
  }

  return { rules, balanced: depth === 0 && !comment && !quote };
}

const errors = [];
for (const file of await sourceFiles("frontend")) {
  const sourceText = await readFile(file, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "block") {
      const css = node.arguments[0];
      const location = source.getLineAndCharacterOfPosition(node.getStart(source));
      const label = `${file}:${location.line + 1}:${location.character + 1}`;

      if (!css || !ts.isNoSubstitutionTemplateLiteral(css)) {
        errors.push(`${label}: block() must contain one static CSS template literal`);
      } else {
        const result = inspectCss(css.text);
        if (!result.balanced) errors.push(`${label}: block() contains unbalanced CSS`);
        else if (result.rules !== 1) {
          errors.push(`${label}: block() contains ${result.rules} top-level rules; expected exactly 1`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("All CSS block() calls contain exactly one top-level rule.");
}
