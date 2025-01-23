V6 Swap API
info
If you have problems landing transactions, read Landing Transactions on Solana.

Jupiter APIs is the easiest way for developers to access liquidity on Solana. Simply pass in the desired pairs, amount, and slippage, and the API will return the serialized transactions needed to execute the swap, which can then be passed into the Solana blockchain with the required signatures.

Risk Disclaimer
Please use Jupiter's Swap API at your own risk. Jupiter's Frontend UI contains multiple safeguards and warnings when quoting. Jupiter is not liable for losses incurred by users on other platforms.

V6 API Reference
All Jupiter swaps are using versioned transactions and address lookup tables. But not all wallets support Versioned Transactions yet, so if you detect a wallet that does not support versioned transactions, you will need to use the asLegacyTransaction parameter.

Learn more about the Jupiter API Documentation at the OpenAPI documentation. This documentation has a REST request list and a built in API Playground. Use the API Playground to try API calls now!

API Documentation
OpenAPI Documentation

Guide for V6 Swap API (code example)
1. Install required libraries
Running this example requires a minimum of NodeJS 16. In your command line terminal, install the libraries.

npm i @solana/web3.js@1
npm i cross-fetch
npm i @project-serum/anchor
npm i bs58

2. Import from libraries and setup connection
Next you can copy the following code snippets to a javascript file jupiter-api-example.js. And when you are ready to run the code, just type: node jupiter-api-example.js

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import { Wallet } from '@project-serum/anchor';
import bs58 from 'bs58';

// It is recommended that you use your own RPC endpoint.
// This RPC endpoint is only for demonstration purposes so that this example will run.
const connection = new Connection('https://neat-hidden-sanctuary.solana-mainnet.discover.quiknode.pro/2af5315d336f9ae920028bbb90a73b724dc1bbed/');


tip
Always make sure that you are using your own RPC endpoint. The RPC endpoint used by the connection object in the above example may not work anymore. For more information about RPC endpoints see the official Solana Documentation to learn more about their public RPC endpoints.

3. Setup your wallet
You can paste in your private key for testing purposes but this is not recommended for production applications.

const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || '')));


4. Get the route for a swap
Here, we are getting a quote to swap from SOL to USDC.

// Swapping SOL to USDC with input 0.1 SOL and 0.5% slippage
const quoteResponse = await (
  await fetch('https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\
&amount=100000000\
&slippageBps=50'
  )
).json();
// console.log({ quoteResponse })


5. Get the serialized transactions to perform the swap
Once we have the quote, we need to serialize the quote into a swap transaction that can be submitted on chain.

// get serialized transactions for the swap
const { swapTransaction } = await (
  await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // quoteResponse from /quote api
      quoteResponse,
      // user public key to be used for the swap
      userPublicKey: wallet.publicKey.toString(),
      // auto wrap and unwrap SOL. default is true
      wrapAndUnwrapSol: true,
      // Optional, use if you want to charge a fee.  feeBps must have been passed in /quote API.
      // feeAccount: "fee_account_public_key"
    })
  })
).json();


6. Deserialize and sign the transaction
// deserialize the transaction
const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
console.log(transaction);

// sign the transaction
transaction.sign([wallet.payer]);

7. Execute the transaction
// get the latest block hash
const latestBlockHash = await connection.getLatestBlockhash();

// Execute the transaction
const rawTransaction = transaction.serialize()
const txid = await connection.sendRawTransaction(rawTransaction, {
  skipPreflight: true,
  maxRetries: 2
});
await connection.confirmTransaction({
 blockhash: latestBlockHash.blockhash,
 lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
 signature: txid
});
console.log(`https://solscan.io/tx/${txid}`);

Solana Network Congestion
Due to the network congestion on Solana, the sendRawTransaction method may not be able to help you to land your transaction. You should check out this transactionSender file to send transaction.

Whole code snippet
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import { Wallet } from '@project-serum/anchor';
import bs58 from 'bs58';

// It is recommended that you use your own RPC endpoint.
// This RPC endpoint is only for demonstration purposes so that this example will run.
const connection = new Connection('https://neat-hidden-sanctuary.solana-mainnet.discover.quiknode.pro/2af5315d336f9ae920028bbb90a73b724dc1bbed/');

const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || '')));

// Swapping SOL to USDC with input 0.1 SOL and 0.5% slippage
const quoteResponse = await (
  await fetch('https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\
&amount=100000000\
&slippageBps=50'
  )
).json();
// console.log({ quoteResponse })

// get serialized transactions for the swap
const { swapTransaction } = await (
  await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // quoteResponse from /quote api
      quoteResponse,
      // user public key to be used for the swap
      userPublicKey: wallet.publicKey.toString(),
      // auto wrap and unwrap SOL. default is true
      wrapAndUnwrapSol: true,
      // Optional, use if you want to charge a fee.  feeBps must have been passed in /quote API.
      // feeAccount: "fee_account_public_key"
    })
  })
).json();

// deserialize the transaction
const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
console.log(transaction);

// sign the transaction
transaction.sign([wallet.payer]);

// Execute the transaction
const rawTransaction = transaction.serialize()
const txid = await connection.sendRawTransaction(rawTransaction, {
  skipPreflight: true,
  maxRetries: 2
});
await connection.confirmTransaction(txid);
console.log(`https://solscan.io/tx/${txid}`);


Advanced error handling to disable certain AMM from the API
Sometimes an AMM will throw an error when swapping. To prevent getting a quote from the failed AMM, you can use the excludeDexes parameter when getting /quote.

Example JS, with the help of @mercurial-finance/optimist package:

import { parseErrorForTransaction } from '@mercurial-finance/optimist';

// TX ID from last step if the transaction failed.
const transaction = connection.getTransaction(txid, {
  maxSupportedTransactionVersion: 0,
  commitment: 'confirmed'
});

const programIdToLabelHash = await (
  await fetch('https://quote-api.jup.ag/v6/program-id-to-label')
).json();
const { programIds } = parseErrorForTransaction(transaction);

let excludeDexes = new Set();
if (programIds) {
  for (let programId of programIds) {
    let foundLabel = programIdToLabelHash[programId];
    if(foundLabel) {
      excludeDexes.add(foundLabel);
    }
  }
}

// Request another quote with `excludeDexes`.
const { data } = await (
  await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112
&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
&amount=100000000&excludeDexes=${Array.from(excludeDexes).join(',')}
&slippageBps=50`
  )
).json();


Instructions Instead of Transaction
Sometimes you may prefer to compose using instructions instead of one transaction that is returned from the /swap endpoint. You can post to /swap-instructions instead, it takes the same parameters as the /swap endpoint.

const instructions = await (
  await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // quoteResponse from /quote api
      quoteResponse,
      userPublicKey: swapUserKeypair.publicKey.toBase58(),
    })
  })
).json();

if (instructions.error) {
  throw new Error("Failed to get swap instructions: " + instructions.error);
}

const {
  tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
  computeBudgetInstructions, // The necessary instructions to setup the compute budget.
  setupInstructions, // Setup missing ATA for the users.
  swapInstruction: swapInstructionPayload, // The actual swap instruction.
  cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
  addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
} = instructions;

const deserializeInstruction = (instruction) => {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
};

const getAddressLookupTableAccounts = async (
  keys: string[]
): Promise<AddressLookupTableAccount[]> => {
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
    );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
};

const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

addressLookupTableAccounts.push(
  ...(await getAddressLookupTableAccounts(addressLookupTableAddresses))
);

const blockhash = (await connection.getLatestBlockhash()).blockhash;
const messageV0 = new TransactionMessage({
  payerKey: payerPublicKey,
  recentBlockhash: blockhash,
  instructions: [
    // uncomment if needed: ...setupInstructions.map(deserializeInstruction),
    deserializeInstruction(swapInstructionPayload),
    // uncomment if needed: deserializeInstruction(cleanupInstruction),
  ],
}).compileToV0Message(addressLookupTableAccounts);
const transaction = new VersionedTransaction(messageV0);


Using maxAccounts
Sometimes, if you are composing with Jupiter Swap instruction, you may want to spare some accounts (64 max in 1 Solana transaction) for your own program instruction, you can use maxAccounts.

// If you know that your instruction will take up 10 accounts, you
// can pass in 54 as `maxAccounts` when quoting.
const { data } = await (
  await fetch('https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\
&amount=100000000\
&slippageBps=50\
&maxAccounts=54'
  )
).json();
const quoteResponse = data;
// console.log(quoteResponse)


The maxAccounts is an estimation since it doesn't consider account overlapping but it is a good start to control how many accounts you want per transaction.

Using Token Ledger Instruction
Sometimes you may not know the exact input amount for the Jupiter swap until an instruction before the swap happens.

For example:

const instructions = await (
  await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // quoteResponse from /quote api
      quoteResponse,
      useTokenLedger: true,
  })
).json();

const {
  tokenLedgerInstruction: tokenLedgerPayload, // If you are using `useTokenLedger = true`.
  swapInstruction: swapInstructionPayload, // The actual swap instruction.
  addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
} = instructions;

// A withdraw instruction that will increase the user input token account amount.
const withdrawInstruction = ...;

// Coupled with the tokenLedgerInstruction, the swap instruction will use the
// user increased amount of the input token account after the withdrawal as input amount.
const tokenLedgerInstruction = new TransactionInstruction({
  programId: new PublicKey(tokenLedgerPayload.programId),
  keys: tokenLedgerPayload.accounts.map((key) => ({
    pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
  data: Buffer.from(tokenLedgerPayload.data, "base64"),
});

const swapInstruction = new TransactionInstruction({
  programId: new PublicKey(swapInstructionPayload.programId),
  keys: swapInstructionPayload.accounts.map((key) => ({
    pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
  data: Buffer.from(swapInstructionPayload.data, "base64"),
});

const getAddressLookupTableAccounts = async (
  keys: string[]
): Promise<AddressLookupTableAccount[]> => {
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
    );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
};

const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

addressLookupTableAccounts.push(
  ...(await getAddressLookupTableAccounts(addressLookupTableAddresses))
);

const messageV0 = new TransactionMessage({
  payerKey: payerPublicKey,
  recentBlockhash: blockhash,
  instructions: [tokenLedgerInstruction, withdrawInstruction, swapInstruction],
}).compileToV0Message(addressLookupTableAccounts);
const transaction = new VersionedTransaction(messageV0);


This can be useful if you want to withdraw from Solend and immediately convert your withdrawal token into another token with Jupiter.

Setting Priority Fee for Your Transaction
If transactions are expiring without confirmation on-chain, this might mean that you have to pay additional fees to prioritize your transaction. To do so, you can set the computeUnitPriceMicroLamports parameter. Refer to Landing Transactions guide for more tips.

const transaction = await (
  await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // quoteResponse from /quote api
      quoteResponse,
      // user public key to be used for the swap
      userPublicKey: wallet.publicKey.toString(),
      dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
      // custom priority fee
        prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 10000000,
          priorityLevel: "veryHigh" // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
        }
      }
    })
  })
).json();


Using Dynamic Slippage
To understand what Dynamic Slippage is, checkout our Jupresearch post

Dynamic slippage is a slippage estimation and optimization mechanism during the /swap call, and is useful because:

Estimates slippage closer to the time of execution.
A set of heuristics that accounts for the type of token traded and user's max slippage tolerance.
Safeguards the user while ensuring success rate.
The frontend sends a payload to the backend with an additional dynamicSlippage field with maxBps set as the user's max slippage (this is important to respect the user's max, the jup.ag UI sets the default to 300bps (3%)).

// get serialized transactions for the swap
const { swapTransaction } = await (
  await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // quoteResponse from /quote api
      quoteResponse,
      // user public key to be used for the swap
      userPublicKey: wallet.publicKey.toString(),
      // auto wrap and unwrap SOL. default is true
      wrapAndUnwrapSol: true,
      // jup.ag frontend default max for user
      dynamicSlippage: { "maxBps": 300 },
      // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
      // feeAccount: "fee_account_public_key"
    })
  })
).json();


The backend returns a response with a serialized transaction that is already using the final optimized slippage and a dynamicSlippageReport for visibility/error catching.

{
    "swapTransaction": "// serialized transaction",
    "lastValidBlockHeight": 266691690,
    "prioritizationFeeLamports": 384,
    "computeUnitLimit": 107468,
    "prioritizationType": {
        "computeBudget": {
            "microLamports": 3577,
            "estimatedMicroLamports": 3577
        }
    },
    "dynamicSlippageReport": {
        // the final optimized slippage bps used in the serialized transaction
        "slippageBps": 12,
        // the incurred out amount observed from simulating the transaction
        "otherAmount": 8759842,
        // the simulated incurred slippage during optimization
        // negative integer refers to the loss in bps while positive refers to the gain
        "simulatedIncurredSlippageBps": -8,
        // an amplification ratio we use to add a buffer to the estimated slippage
        "amplificationRatio": "1.5"
    },
    "simulationError": null
}

POST /swap
Returns a transaction that you can use from the quote you get from /quote.

Request Body — REQUIRED
userPublicKey string — REQUIRED
The user public key.

wrapAndUnwrapSol boolean
Default is true. If true, will automatically wrap/unwrap SOL. If false, it will use wSOL token account. Will be ignored if destinationTokenAccount is set because the destinationTokenAccount may belong to a different user that we have no authority to close.

useSharedAccounts boolean
This enables the usage of shared program accounts. That means no intermediate token accounts or open orders accounts need to be created for the users. If you are using destinationTokenAccount, you must set this to true. If this is not set, this will be set to false in the case that the route plan is just through one simple AMM that isn't Openbook or Serum. Otherwise, it will be set to true.

feeAccount string
Fee token account, it can be either the input mint or the output mint for ExactIn and only the input mint for ExactOut, you can use any token account of the correct mint (it no longer needs the Referral program). It doesn't support Token2022 tokens.

trackingAccount string
Tracking account, this can be any public key that you can use to track the transactions, especially useful for integrator. Then, you can use the https://stats.jup.ag/tracking-account/:public-key/YYYY-MM-DD/HH endpoint to get all the swap transactions from this public key.

computeUnitPriceMicroLamports integer
The compute unit price to prioritize the transaction, the additional fee will be computeUnitLimit (1400000) * computeUnitPriceMicroLamports. If auto is used, Jupiter will automatically set a priority fee and it will be capped at 5,000,000 lamports / 0.005 SOL.

prioritizationFeeLamports integer
Prioritization fee lamports paid for the transaction in addition to the signatures fee. Mutually exclusive with compute_unit_price_micro_lamports. If auto is used, Jupiter will automatically set a priority fee and it will be capped at 5,000,000 lamports / 0.005 SOL. If autoMultiplier ({"autoMultiplier"}: 3}) is used, the priority fee will be a multplier on the auto fee. If jitoTipLamports ({"jitoTipLamports": 5000}) is used, a tip intruction will be included to Jito and no priority fee will be set. If priorityLevelWithMaxLamports ({"priorityLevelWithMaxLamports": {"priorityLevel": "high", "maxLamports": 123423}}) is used, it will suggest a priority fee based on medium, high, or veryHigh automatically with a cap set by maxLamports.

asLegacyTransaction boolean
Default is false. Request a legacy transaction rather than the default versioned transaction, needs to be paired with a quote using asLegacyTransaction otherwise the transaction might be too large.

useTokenLedger boolean
Default is false. This is useful when the instruction before the swap has a transfer that increases the input token amount. Then, the swap will just use the difference between the token ledger token amount and post token amount.

destinationTokenAccount string
Public key of the token account that will be used to receive the token out of the swap. If not provided, the user's ATA will be used. If provided, we assume that the token account is already initialized.

dynamicComputeUnitLimit boolean
When enabled, it will do a swap simulation to get the compute unit used and set it in ComputeBudget's compute unit limit. This will increase latency slightly since there will be one extra RPC call to simulate this. Default is false.

skipUserAccountsRpcCalls boolean
When enabled, it will not do any rpc calls check on user's accounts. Enable it only when you already setup all the accounts needed for the trasaction, like wrapping or unwrapping sol, destination account is already created.

dynamicSlippage object
A dynamic slippage estimation based on a set of heuristics that accounts for the type of token traded and user's max slippage tolerance, providing an optimal value that safeguards the user while ensuring success rate.

minBps int32
The user min slippage.

maxBps int32
The user max slippage, note that jup.ag UI defaults to 300bps (3%).

quoteResponse object — REQUIRED
inputMint string — REQUIRED
inAmount string — REQUIRED
outputMint string — REQUIRED
outAmount string — REQUIRED
otherAmountThreshold string — REQUIRED
swapMode string — REQUIRED
Possible values: [ExactIn, ExactOut]

slippageBps int32 — REQUIRED
platformFee object
amount string
feeBps int32
priceImpactPct string — REQUIRED
routePlan object[] — REQUIRED
swapInfo object — REQUIRED
ammKey string — REQUIRED
label string
inputMint string — REQUIRED
outputMint string — REQUIRED
inAmount string — REQUIRED
outAmount string — REQUIRED
feeAmount string — REQUIRED
feeMint string — REQUIRED
percent int32 — REQUIRED
contextSlot number
timeTaken number
Responses
200
Successful response

Schema — OPTIONAL
swapTransaction string
lastValidBlockHeight number
prioritizationFeeLamports number — OPTIONAL
dynamicSlippageReport object — OPTIONAL
slippageBps int32 — OPTIONAL
otherAmount int32 — OPTIONAL
simulatedIncurredSlippageBps int32 — OPTIONAL
amplificationRatio string — OPTIONAL
Previous
GET /quote
const axios = require('axios');
let data = JSON.stringify({
  "userPublicKey": "string",
  "wrapAndUnwrapSol": true,
  "useSharedAccounts": true,
  "feeAccount": "string",
  "trackingAccount": "string",
  "computeUnitPriceMicroLamports": 0,
  "prioritizationFeeLamports": 0,
  "asLegacyTransaction": false,
  "useTokenLedger": false,
  "destinationTokenAccount": "string",
  "dynamicComputeUnitLimit": true,
  "skipUserAccountsRpcCalls": true,
  "dynamicSlippage": {
    "minBps": 0,
    "maxBps": 0
  },
  "quoteResponse": {
    "inputMint": "string",
    "inAmount": "string",
    "outputMint": "string",
    "outAmount": "string",
    "otherAmountThreshold": "string",
    "swapMode": "ExactIn",
    "slippageBps": 0,
    "platformFee": {
      "amount": "string",
      "feeBps": 0
    },
    "priceImpactPct": "string",
    "routePlan": [
      {
        "swapInfo": {
          "ammKey": "string",
          "label": "string",
          "inputMint": "string",
          "outputMint": "string",
          "inAmount": "string",
          "outAmount": "string",
          "feeAmount": "string",
          "feeMint": "string"
        },
        "percent": 0
      }
    ],
    "contextSlot": 0,
    "timeTaken": 0
  }
});


let config = {
  method: 'post',
  maxBodyLength: Infinity,
  url: 'https://quote-api.jup.ag/v6/swap',
  headers: { 
    'Content-Type': 'application/json', 
    'Accept': 'application/json'
  },
  data : data
};


axios.request(config)
.then((response) => {
  console.log(JSON.stringify(response.data));
})
.catch((error) => {
  console.log(error);
});

POST /swap-instructions
Returns instructions that you can use from the quote you get from /quote.

Request Body — REQUIRED
userPublicKey string — REQUIRED
The user public key.

wrapAndUnwrapSol boolean
Default is true. If true, will automatically wrap/unwrap SOL. If false, it will use wSOL token account. Will be ignored if destinationTokenAccount is set because the destinationTokenAccount may belong to a different user that we have no authority to close.

useSharedAccounts boolean
This enables the usage of shared program accounts. That means no intermediate token accounts or open orders accounts need to be created for the users. If you are using destinationTokenAccount, you must set this to true. If this is not set, this will be set to false in the case that the route plan is just through one simple AMM that isn't Openbook or Serum. Otherwise, it will be set to true.

feeAccount string
Fee token account, it can be either the input mint or the output mint for ExactIn and only the input mint for ExactOut, you can use any token account of the correct mint (it no longer needs the Referral program). It doesn't support Token2022 tokens.

trackingAccount string
Tracking account, this can be any public key that you can use to track the transactions, especially useful for integrator. Then, you can use the https://stats.jup.ag/tracking-account/:public-key/YYYY-MM-DD/HH endpoint to get all the swap transactions from this public key.

computeUnitPriceMicroLamports integer
The compute unit price to prioritize the transaction, the additional fee will be computeUnitLimit (1400000) * computeUnitPriceMicroLamports. If auto is used, Jupiter will automatically set a priority fee and it will be capped at 5,000,000 lamports / 0.005 SOL.

prioritizationFeeLamports integer
Prioritization fee lamports paid for the transaction in addition to the signatures fee. Mutually exclusive with compute_unit_price_micro_lamports. If auto is used, Jupiter will automatically set a priority fee and it will be capped at 5,000,000 lamports / 0.005 SOL. If autoMultiplier ({"autoMultiplier"}: 3}) is used, the priority fee will be a multplier on the auto fee. If jitoTipLamports ({"jitoTipLamports": 5000}) is used, a tip intruction will be included to Jito and no priority fee will be set. If priorityLevelWithMaxLamports ({"priorityLevelWithMaxLamports": {"priorityLevel": "high", "maxLamports": 123423}}) is used, it will suggest a priority fee based on medium, high, or veryHigh automatically with a cap set by maxLamports.

asLegacyTransaction boolean
Default is false. Request a legacy transaction rather than the default versioned transaction, needs to be paired with a quote using asLegacyTransaction otherwise the transaction might be too large.

useTokenLedger boolean
Default is false. This is useful when the instruction before the swap has a transfer that increases the input token amount. Then, the swap will just use the difference between the token ledger token amount and post token amount.

destinationTokenAccount string
Public key of the token account that will be used to receive the token out of the swap. If not provided, the user's ATA will be used. If provided, we assume that the token account is already initialized.

dynamicComputeUnitLimit boolean
When enabled, it will do a swap simulation to get the compute unit used and set it in ComputeBudget's compute unit limit. This will increase latency slightly since there will be one extra RPC call to simulate this. Default is false.

skipUserAccountsRpcCalls boolean
When enabled, it will not do any rpc calls check on user's accounts. Enable it only when you already setup all the accounts needed for the trasaction, like wrapping or unwrapping sol, destination account is already created.

dynamicSlippage object
A dynamic slippage estimation based on a set of heuristics that accounts for the type of token traded and user's max slippage tolerance, providing an optimal value that safeguards the user while ensuring success rate.

minBps int32
The user min slippage.

maxBps int32
The user max slippage, note that jup.ag UI defaults to 300bps (3%).

quoteResponse object — REQUIRED
inputMint string — REQUIRED
inAmount string — REQUIRED
outputMint string — REQUIRED
outAmount string — REQUIRED
otherAmountThreshold string — REQUIRED
swapMode string — REQUIRED
Possible values: [ExactIn, ExactOut]

slippageBps int32 — REQUIRED
platformFee object
amount string
feeBps int32
priceImpactPct string — REQUIRED
routePlan object[] — REQUIRED
swapInfo object — REQUIRED
ammKey string — REQUIRED
label string
inputMint string — REQUIRED
outputMint string — REQUIRED
inAmount string — REQUIRED
outAmount string — REQUIRED
feeAmount string — REQUIRED
feeMint string — REQUIRED
percent int32 — REQUIRED
contextSlot number
timeTaken number
Responses
200
Successful response

Schema — OPTIONAL
tokenLedgerInstruction object — OPTIONAL
programId string
accounts object[]
pubkey string
isSigner boolean
isWritable boolean
data string
otherInstructions object
programId string
accounts object[]
pubkey string
isSigner boolean
isWritable boolean
data string
computeBudgetInstructions object[]
The necessary instructions to setup the compute budget.

programId string
accounts object[]
pubkey string
isSigner boolean
isWritable boolean
data string
setupInstructions object[]
Setup missing ATA for the users.

programId string
accounts object[]
pubkey string
isSigner boolean
isWritable boolean
data string
swapInstruction object
programId string
accounts object[]
pubkey string
isSigner boolean
isWritable boolean
data string
cleanupInstruction object — OPTIONAL
programId string
accounts object[]
pubkey string
isSigner boolean
isWritable boolean
data string
addressLookupTableAddresses string[]
The lookup table addresses that you can use if you are using versioned transaction.

const axios = require('axios');
let data = JSON.stringify({
  "userPublicKey": "string",
  "wrapAndUnwrapSol": true,
  "useSharedAccounts": true,
  "feeAccount": "string",
  "trackingAccount": "string",
  "computeUnitPriceMicroLamports": 0,
  "prioritizationFeeLamports": 0,
  "asLegacyTransaction": false,
  "useTokenLedger": false,
  "destinationTokenAccount": "string",
  "dynamicComputeUnitLimit": true,
  "skipUserAccountsRpcCalls": true,
  "dynamicSlippage": {
    "minBps": 0,
    "maxBps": 0
  },
  "quoteResponse": {
    "inputMint": "string",
    "inAmount": "string",
    "outputMint": "string",
    "outAmount": "string",
    "otherAmountThreshold": "string",
    "swapMode": "ExactIn",
    "slippageBps": 0,
    "platformFee": {
      "amount": "string",
      "feeBps": 0
    },
    "priceImpactPct": "string",
    "routePlan": [
      {
        "swapInfo": {
          "ammKey": "string",
          "label": "string",
          "inputMint": "string",
          "outputMint": "string",
          "inAmount": "string",
          "outAmount": "string",
          "feeAmount": "string",
          "feeMint": "string"
        },
        "percent": 0
      }
    ],
    "contextSlot": 0,
    "timeTaken": 0
  }
});


let config = {
  method: 'post',
  maxBodyLength: Infinity,
  url: 'https://quote-api.jup.ag/v6/swap-instructions',
  headers: { 
    'Content-Type': 'application/json', 
    'Accept': 'application/json'
  },
  data : data
};


axios.request(config)
.then((response) => {
  console.log(JSON.stringify(response.data));
})
.catch((error) => {
  console.log(error);
});

const axios = require('axios');


let config = {
  method: 'get',
  maxBodyLength: Infinity,
  url: 'https://quote-api.jup.ag/v6/tokens',
  headers: { 
    'Accept': 'application/json'
  }
};


axios.request(config)
.then((response) => {
  console.log(JSON.stringify(response.data));
})
.catch((error) => {
  console.log(error);
});

