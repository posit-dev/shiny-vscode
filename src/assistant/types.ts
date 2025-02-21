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

export type JSONifiable =
  | string
  | number
  | boolean
  | null
  | Array<JSONifiable>
  | { [key: string]: JSONifiable };
