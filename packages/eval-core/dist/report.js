import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
// ajv-formats ships CommonJS; under NodeNext its default export arrives wrapped.
const addFormats = addFormatsModule;
const schema = JSON.parse(readFileSync(new URL("../../../schemas/eval-report.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
/** Checks a report against schemas/eval-report.schema.json, the contract every tool's eval writes. */
export function validateReport(report) {
    const valid = validate(report);
    const errors = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""} ${JSON.stringify(e.params)}`);
    return { valid, errors };
}
