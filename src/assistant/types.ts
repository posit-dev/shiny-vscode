export type FileContentJson = {
  name: string;
  content: string;
  type?: "text" | "binary";
};

export type FileContent = {
  name: string;
  content: string;
  type: "text" | "binary";
};

export type FileSetDiff = {
  format: "diff";
  files: FileContent[];
};

export type FileSetComplete = {
  format: "complete";
  files: FileContent[];
};

export type FileSet = FileSetDiff | FileSetComplete;

export type JSONifiable =
  | string
  | number
  | boolean
  | null
  | Array<JSONifiable>
  | { [key: string]: JSONifiable };
