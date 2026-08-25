export enum ShinyDiagnosticCode {
  uncalledReactive = "shiny.uncalledReactive",
  blockingAsync = "shiny.blockingAsync",
  calcSideEffect = "shiny.calcSideEffect",
  inplaceMutation = "shiny.inplaceMutation",
  globalStateLeak = "shiny.globalStateLeak",
  idMismatch = "shiny.idMismatch",
}

export enum ShinyDiagnosticSeverity {
  error = 0,
  warning = 1,
  information = 2,
  hint = 3,
}

export interface RawDiagnostic {
  code: ShinyDiagnosticCode;
  message: string;
  severity: ShinyDiagnosticSeverity;
  range: {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
  };
}
