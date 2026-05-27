export interface TimestampClaim {
  receiptId: string;
  hash: string;
  createdAt: string;
  proofUrl: string;
  blockchainStatus: 'pending' | 'confirmed';
  blockNumber?: number;
  txHash?: string;
}
