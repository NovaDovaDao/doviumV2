// src/config/config.ts
interface Wallet {
  name: string;
  address: string;
  emoji: string;
  tags: string[];
}

interface Config {
  settings: {
    wsol_pc_mint: string;
    inspect_url: string;
    inspect_name: string;
    inspect_url_wallet: string;
    show_max_duplicates: number;
    show_duplicate_min_holders: number;
    copyTrading: {
      enabled: boolean;
      simulationMode: boolean;
      simulationBalance: number;
      minSolAmount: number;
      fixedBuyAmount: number;
      delayBeforeSellSeconds: number;
      slippageBps: number;
      db: {
        pnlTable: string;
      };
    };
  };
  db: {
    db_name_tracker_transfers: string;
  };
  wallets: Wallet[];
}

export const config: Config = {
  settings: {
    wsol_pc_mint: "So11111111111111111111111111111111111111112",
    inspect_url: "https://gmgn.ai/sol/token/",
    inspect_name: "👽 Open GMGN",
    inspect_url_wallet: "https://gmgn.ai/sol/address/",
    show_max_duplicates: 5,
    show_duplicate_min_holders: 5,
    copyTrading: {
      enabled: true,
      simulationMode: true,
      simulationBalance: 1,
      minSolAmount: 20,
      fixedBuyAmount: 0.1,
      delayBeforeSellSeconds: 15,
      slippageBps: 100,
      db: {
        pnlTable: "copy_trading_pnl",
      },
    },
  },
  db: {
    db_name_tracker_transfers: "src/db/holdings.db",
  },
  wallets: [
    {
      name: "mrfrog",
      address: "4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh",
      emoji: "👽",
      tags: [],
    },
    {
      name: "KK",
      address: "kQdJVZvix2BPCz2i46ErUPk2a74Uf37QZL5jsRdAD8y",
      emoji: "💰",
      tags: [],
    },
    {
      name: "frank",
      address: "CRVidEDtEUTYZisCxBZkpELzhQc9eauMLR3FWg74tReL",
      emoji: "👽",
      tags: [],
    },
    {
      name: "crypto rapper",
      address: "HPLsd96kTV6WN9Nyjbg3Z69nFQf5UJS1ovUhiJEG8mBM",
      emoji: "💰",
      tags: [],
    },
    {
      name: "dave Portnoy",
      address: "5rkPDK4JnVAumgzeV2Zu8vjggMTtHdDtrsd5o9dhGZHD",
      emoji: "💰",
      tags: [],
    },
    {
      name: "Cupseyy",
      address: "suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK",
      emoji: "👽",
      tags: [],
    },
    {
      name: "mcdeomx",
      address: "CSFjH3Z7LCqFbFPLVYJHUmJuLRbnfW5jk7QsCxqfV1RB",
      emoji: "👽",
      tags: [],
    },
    {
      name: "sniperscandy",
      address: "ERCjfWc8ZYH2eCSzuhTn8CbSHorueEJ5XLpBvTe7ovVv",
      emoji: "👽",
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

export function getCopyTradingConfig() {
  return config.settings.copyTrading;
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
