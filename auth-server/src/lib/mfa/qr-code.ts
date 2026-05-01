import "server-only";

import QRCode from "qrcode";

export async function renderQrPngDataUrl(otpauth_url: string): Promise<string> {
  return await QRCode.toDataURL(otpauth_url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });
}
