import axios from "axios";

export async function uploadToPinata(jsonData: unknown): Promise<string> {
  const { data } = await axios.post("/api/pinata/upload", jsonData, {
    timeout: 60_000,
  });

  if (!data.ipfsHash) {
    throw new Error("Upload succeeded but no IPFS hash was returned");
  }

  return data.ipfsHash;
}

export async function getDataFromPinata(hash: string) {
  const url = `${process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud"}/ipfs/${hash}`;
  const { data } = await axios.get(url);
  return data;
}
