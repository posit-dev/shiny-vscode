// This allows globals.css to be imported in main.tsx
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
