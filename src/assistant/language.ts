export type LanguageInfo = {
  name: Readonly<LangName>;
  properName: Readonly<LangProperName>;
  fileExt: Readonly<LangFileExt>;
};

/** This is the source of truth for language information */
export const shinyLanguages = {
  r: { name: "r", properName: "R", fileExt: "R" },
  python: { name: "python", properName: "Python", fileExt: "py" },
} as const;

type ShinyLanguageInfos = (typeof shinyLanguages)[keyof typeof shinyLanguages];

/** Internal identifier for a programming language (e.g., "python", "r") */
export type LangName = ShinyLanguageInfos["name"];

/** Human-readable name of a programming language (e.g., "Python", "R") */
export type LangProperName = ShinyLanguageInfos["properName"];

/** Primary file extension associated with a language (e.g., "py", "r") */
export type LangFileExt = ShinyLanguageInfos["fileExt"];

/**
 * Retrieves language information based on one of three identifiers: language name,
 * proper name, or file extension. Only one identifier should be provided at a time.
 *
 * @example
 * ```typescript
 * langInfo({ name: "python" })          // Get info by language name
 * langInfo({ properName: "Python" })    // Get info by proper name
 * langInfo({ fileExt: "py" })          // Get info by file extension
 * ```
 *
 * @throws {Error} If no parameter is provided or if the language is not found
 * @returns The matching LanguageInfo object containing all language metadata
 */
export function langInfo({
  name,
}: {
  name: LangName;
  properName?: undefined;
  fileExt?: undefined;
}): LanguageInfo;

export function langInfo({
  properName,
}: {
  name?: undefined;
  properName: LangProperName;
  fileExt?: undefined;
}): LanguageInfo;

export function langInfo({
  fileExt,
}: {
  name?: undefined;
  properName?: undefined;
  fileExt: LangFileExt;
}): LanguageInfo;

export function langInfo({
  name,
  properName,
  fileExt,
}: {
  name?: LangName;
  properName?: LangProperName;
  fileExt?: LangFileExt;
}): LanguageInfo {
  const languageValues = Object.values(shinyLanguages);

  if (name) {
    return languageValues.find((lang) => lang.name === name) as LanguageInfo;
  } else if (properName) {
    return languageValues.find(
      (lang) => lang.properName === properName
    ) as LanguageInfo;
  } else if (fileExt) {
    return languageValues.find(
      (lang) => lang.fileExt === fileExt
    ) as LanguageInfo;
  }

  throw new Error("At least one parameter must be provided");
}

export function inferFileType(filename: string): LangName | "text" {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".py":
      return "python";
    case ".r":
      return "r";
    default:
      return "text";
  }
}

export function langNameToFileExt(name: LangName): LangFileExt {
  return shinyLanguages[name].fileExt;
}

export function langNameToProperName(name: LangName): LangProperName {
  return shinyLanguages[name].properName;
}
