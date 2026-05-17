declare module "qrcode-terminal" {
  const qrt: { generate: (text: string, opts?: { small?: boolean }) => void };
  export default qrt;
}
