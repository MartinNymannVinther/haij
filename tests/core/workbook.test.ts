import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkbook } from "@/core/xlsx";

/**
 * A multi-tab workbook has four places to get the bookkeeping wrong: the
 * content types, the workbook's sheet list, the relationship ids that tie
 * that list to the files, and the files themselves. Get any one of them out
 * of step and Excel refuses the whole file with a message that names none
 * of it. So the parts are checked against each other here, by a reader that
 * did not write them.
 */

function unzip(buffer: Buffer): { read: (name: string) => string; names: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "workbook-"));
  const file = join(dir, "book.xlsx");
  writeFileSync(file, buffer);
  const listing = execFileSync("python3", [
    "-c",
    "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;z.extractall(sys.argv[2]);print('\\n'.join(z.namelist()))",
    file,
    dir,
  ]).toString();
  return {
    read: (name: string) => readFileSync(join(dir, name), "utf8"),
    names: listing.trim().split("\n"),
  };
}

const sheets = [
  {
    name: "Kunder",
    columns: [{ header: "Navn" }, { header: "CVR" }],
    rows: [["Eksempel A-kasse", "12345678"]],
  },
  {
    name: "Fakturaer",
    columns: [{ header: "Nummer" }, { header: "Beløb" }],
    rows: [[284, 96000]],
  },
  { name: "Tomt ark", columns: [{ header: "(ingen rækker)" }], rows: [] },
];

describe("buildWorkbook", () => {
  it("writes one worksheet part per sheet, and declares every one of them", () => {
    const { read, names } = unzip(buildWorkbook(sheets));

    for (let i = 1; i <= sheets.length; i += 1) {
      expect(names).toContain(`xl/worksheets/sheet${i}.xml`);
      expect(read("[Content_Types].xml")).toContain(`/xl/worksheets/sheet${i}.xml`);
      expect(read("xl/_rels/workbook.xml.rels")).toContain(`Target="worksheets/sheet${i}.xml"`);
    }
    // Styles must not collide with a worksheet's relationship id.
    expect(read("xl/_rels/workbook.xml.rels")).toContain(
      `Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"`,
    );
  });

  it("names the tabs in order and points each at its own file", () => {
    const workbook = unzip(buildWorkbook(sheets)).read("xl/workbook.xml");
    expect(workbook).toContain('<sheet name="Kunder" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('<sheet name="Fakturaer" sheetId="2" r:id="rId2"/>');
    expect(workbook).toContain('<sheet name="Tomt ark" sheetId="3" r:id="rId3"/>');
  });

  it("puts each sheet's own rows in its own part", () => {
    const { read } = unzip(buildWorkbook(sheets));
    expect(read("xl/worksheets/sheet1.xml")).toContain("Eksempel A-kasse");
    expect(read("xl/worksheets/sheet1.xml")).not.toContain("96000");
    expect(read("xl/worksheets/sheet2.xml")).toContain("<v>284</v>");
    expect(read("xl/worksheets/sheet3.xml")).toContain("(ingen rækker)");
  });

  it("renames a duplicate tab rather than writing a file Excel will reject", () => {
    const long = "Et meget langt fanenavn der bliver klippet";
    const workbook = unzip(
      buildWorkbook([
        { name: long, columns: [{ header: "A" }], rows: [] },
        { name: long, columns: [{ header: "A" }], rows: [] },
      ]),
    ).read("xl/workbook.xml");

    const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]!);
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
    for (const name of names) expect(name.length).toBeLessThanOrEqual(31);
  });

  it("refuses an empty workbook instead of writing an unopenable file", () => {
    expect(() => buildWorkbook([])).toThrow();
  });
});
