import axios from "axios";

export async function uploadToPinata(jsonData: unknown, fileName?: string): Promise<string> {
  const { data } = await axios.post(
    "/api/pinata/upload",
    { _pinataData: jsonData, _pinataFileName: fileName },
    {
      timeout: 60_000,
    },
  );

  if (!data.ipfsHash) {
    throw new Error("Upload succeeded but no IPFS hash was returned");
  }

  return data.ipfsHash;
}

export async function getDataFromPinata(hash: string) {
  const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";
  const base = gateway.startsWith("http") ? gateway : `https://${gateway}`;
  const url = `${base}/ipfs/${hash}`;
  const { data } = await axios.get(url);
  return data;
}
