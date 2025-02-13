// src/config/config.ts

export interface TradeSettings {
  waitTimeBeforeBuy: number;
  waitTimeBeforeSell: number;
  minPoolSize: number;
  takeProfit: number;
  stopLoss: number;
  slippageBps: number;
  programAddress: string; // Add program address
  copyTrading: {
    enabled: boolean;
    simulationMode: boolean;
    simulationBalance: number;
    minSolAmount: number;
    fixedBuyAmount: number;
    delayBeforeSellSeconds: number;
    slippageBps: number;
  };
  tradeModes: {
    yolo: boolean;
    marry: boolean;
    bro: boolean;
    simulation: boolean;
  };
  simulation: {
    initialBalance: number;   // in SOL
    enabled: boolean;
    logToFile: boolean;
    logDirectory: string;
  };
}

export interface Wallet {
  name: string;
  address: string;
  emoji: string;
  copy: boolean;
  tags: string[];
}

export interface Config {
  settings: {
    wsol_pc_mint: string;
    inspect_url: string;
    inspect_name: string;
    inspect_url_wallet: string;
    tradeSettings: TradeSettings;
  };
  wallets: Wallet[];
}

export const config: Config = {
  settings: {
    wsol_pc_mint: "So11111111111111111111111111111111111111112",
    inspect_url: "https://solscan.io/token/",
    inspect_name: "View on Solscan",
    inspect_url_wallet: "https://solscan.io/account/",
    tradeSettings: {
      waitTimeBeforeBuy: 15,
      waitTimeBeforeSell: 20,
      minPoolSize: 100,
      takeProfit: 50,
      stopLoss: 30,
      slippageBps: 100,
      programAddress: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      copyTrading: {
        enabled: true,
        simulationMode: true,
        simulationBalance: 1,
        minSolAmount: 20,
        fixedBuyAmount: 0.1,
        delayBeforeSellSeconds: 15,
        slippageBps: 100,
      },
      tradeModes: {
        yolo: false,
        marry: false,
        bro: false,
        simulation: true
      },
      simulation: {
        enabled: false,
        initialBalance: 10, // 10 SOL
        logToFile: true,
        logDirectory: './logs/simulation'
      }
    }
  },
  wallets: [
    {
      name: "mrfrog",
      address: "4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh",
      emoji: "👽",
      copy: false,
      tags: ["whale"],
    },
    {
      name: "KK",
      address: "kQdJVZvix2BPCz2i46ErUPk2a74Uf37QZL5jsRdAD8y",
      emoji: "💰",
      copy: false,
      tags: [],
    },
    {
      name: "frank",
      address: "CRVidEDtEUTYZisCxBZkpELzhQc9eauMLR3FWg74tReL",
      emoji: "👽",
      copy: true,
      tags: [],
    },
    {
      name: "crypto rapper",
      address: "HPLsd96kTV6WN9Nyjbg3Z69nFQf5UJS1ovUhiJEG8mBM",
      emoji: "💰",
      copy: false,
      tags: [],
    },
    {
      name: "dave Portnoy",
      address: "5rkPDK4JnVAumgzeV2Zu8vjggMTtHdDtrsd5o9dhGZHD",
      emoji: "💰",
      copy: false,
      tags: [],
    },
    {
      name: "Cupseyy",
      address: "suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK",
      emoji: "👽",
      copy: false,
      tags: [],
    },
    {
      name: "mcdeomx",
      address: "CSFjH3Z7LCqFbFPLVYJHUmJuLRbnfW5jk7QsCxqfV1RB",
      emoji: "👽",
      copy: false,
      tags: [],
    },
    {
      name: "sniperscandy",
      address: "ERCjfWc8ZYH2eCSzuhTn8CbSHorueEJ5XLpBvTe7ovVv",
      emoji: "👽",
      copy: false,
      tags: [],
    },
  ],
};

// Utility functions to work with the config
export const getWalletByAddress = (address: string): Wallet | undefined => {
  return config.wallets.find((wallet) => wallet.address === address);
};

export const formatWalletName = (address: string): string => {
  const wallet = getWalletByAddress(address);
  return wallet
    ? `${wallet.emoji} ${wallet.name}`
    : `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export function getWalletByName(name: string) {
  return config.wallets.find(
    (wallet) => wallet.name.toLowerCase() === name.toLowerCase()
  );
}

export function getWalletsByTag(tag: string) {
  return config.wallets.filter((wallet) => wallet.tags.includes(tag));
}

export function getAllWalletAddresses() {
  return config.wallets.map((wallet) => wallet.address);
}

export function getUniqueWallets() {
  const uniqueWallets = new Map();
  config.wallets.forEach((wallet) => {
    if (!uniqueWallets.has(wallet.address)) {
      uniqueWallets.set(wallet.address, wallet);
    }
  });
  return Array.from(uniqueWallets.values());
}

// Validation function to check for duplicate addresses
export function validateWallets() {
  const addresses = new Set<string>();
  const duplicates: string[] = [];

  config.wallets.forEach((wallet) => {
    if (addresses.has(wallet.address)) {
      duplicates.push(wallet.address);
    }
    addresses.add(wallet.address);
  });

  if (duplicates.length > 0) {
    console.warn(
      "Warning: Duplicate wallet addresses found:",
      duplicates.map((addr) => ({
        address: addr,
        instances: config.wallets
          .filter((w) => w.address === addr)
          .map((w) => w.name),
      }))
    );
  }

  return duplicates.length === 0;
}

// Helper function to get inspection URL for token or wallet
export function getInspectUrl(type: "token" | "wallet", address: string) {
  if (type === "token") {
    return `${config.settings.inspect_url}${address}`;
  }
  return `${config.settings.inspect_url_wallet}${address}`;
}

// Initialize validation on import
validateWallets();

export default config;
