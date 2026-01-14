
export default function getStringByteSize(str: string): number {
  return new Blob([str]).size;
}