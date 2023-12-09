import { observer } from "mobx-react-lite"
import React, { FC, useState } from "react"
import { TextStyle, ViewStyle } from "react-native"
import { Button, Screen, Text } from "../components"
import { AppStackScreenProps } from "../navigators"
import { spacing } from "../theme"
import TangemSdk, { Card } from "tangem-sdk-react-native"
import { FeeMarketEIP1559Transaction } from "@ethereumjs/tx"
import { Buffer } from "@craftzdog/react-native-buffer"
import { publicToAddress } from "@ethereumjs/util"
import axios from "axios"

interface HomeProps extends AppStackScreenProps<"Home"> {}

export const Home: FC<HomeProps> = observer(function Home(_props) {
  const [card, setCard] = useState<Card | undefined>()

  interface RPCPayload {
    method: string
    params?: any[]
  }
  async function rpcRequest(payload: RPCPayload) {
    const endPoint = "https://sepolia.infura.io/v3/"
    const response = await axios
      .post(endPoint, { jsonrpc: "2.0", id: 1, ...payload })
      .catch(console.error)
    if (!response) {
      throw new Error("RPC request failed")
    }
    return response.data.result
  }

  async function scanCard() {
    const scannedCard = await TangemSdk.scanCard()
    setCard(scannedCard)
  }

  async function generateTransaction(forAddress: string) {
    const transactionBase = {
      to: forAddress,
      value: BigInt(0),
      data: "0x" + Buffer.from("Hello!").toString("hex"),
    }
    const rpcChainId = await rpcRequest({ method: "eth_chainId" })
    const rpcGasEstimate = await rpcRequest({
      method: "eth_estimateGas",
      params: [
        { from: forAddress, ...transactionBase, value: "0x" + transactionBase.value.toString(16) },
        "latest",
      ],
    })
    const transactionData = {
      chainId: BigInt(rpcChainId),
      gasLimit: BigInt(rpcGasEstimate),
      ...transactionBase,
    }

    const rpcNonce = await rpcRequest({
      method: "eth_getTransactionCount",
      params: [forAddress, "latest"],
    })
    const rpcGasPrice = await rpcRequest({ method: "eth_gasPrice" })
    const transactionSettings = {
      nonce: BigInt(rpcNonce),
      maxFeePerGas: BigInt(rpcGasPrice),
      maxPriorityFeePerGas: BigInt(1), // 1 wei
      type: "0x02",
    }

    return { ...transactionData, ...transactionSettings }
  }

  async function signHash(withCard: Card, withWallet: number) {
    const wallet = withCard.wallets[withWallet]
    if (wallet.curve !== "secp256k1") {
      throw new Error(
        `Wallet using non-supported curve ${wallet.curve}. Please provide a wallet with secp256k1 curve.`,
      )
    }
    const address = Buffer.from(
      publicToAddress(Buffer.from(wallet.publicKey, "hex"), true),
    ).toString("hex")

    const transactionInfo = await generateTransaction("0x" + address)

    const unsignedTransaction = FeeMarketEIP1559Transaction.fromTxData({
      // https://github.com/ethereumjs/ethereumjs-monorepo/blob/master/packages/tx/src/eip1559Transaction.ts
      // Could use transactionInfo directly, explicit for reduced chance of mistakes
      chainId: transactionInfo.chainId,
      to: transactionInfo.to,
      value: transactionInfo.value,
      data: transactionInfo.data,
      gasLimit: transactionInfo.gasLimit,
      nonce: transactionInfo.nonce,
      maxFeePerGas: transactionInfo.maxFeePerGas,
      maxPriorityFeePerGas: transactionInfo.maxPriorityFeePerGas,
      type: transactionInfo.type,
    })
    const toSign = Buffer.from(unsignedTransaction.getHashedMessageToSign()).toString("hex")

    const tangemSign = await TangemSdk.sign({
      // Tangem React Native SDK doesnt support signing a single hash
      hashes: [toSign, toSign] as any as [string], // mistake in the Tangem SDK ? Should be string[] ?
      cardId: withCard.cardId,
      walletPublicKey: wallet.publicKey,
    })
    const signature = tangemSign.signatures[0]
    const recovery = BigInt(0) // Tangem card doesnt return this value, try both and see what address matches

    const transaction0 = FeeMarketEIP1559Transaction.fromTxData({
      // https://github.com/ethereumjs/ethereumjs-monorepo/blob/master/packages/util/src/signature.ts
      ...unsignedTransaction,
      v: recovery, // + transactionData.chainId * BigInt(2) + BigInt(35),
      r: BigInt("0x" + signature.substring(0, 64)),
      s: BigInt("0x" + signature.substring(64, 128)),
    })
    const transaction1 = FeeMarketEIP1559Transaction.fromTxData({
      ...unsignedTransaction,
      v: BigInt(1),
      r: BigInt("0x" + signature.substring(0, 64)),
      s: BigInt("0x" + signature.substring(64, 128)),
    })

    let transaction: FeeMarketEIP1559Transaction
    if (Buffer.from(transaction0.getSenderAddress().bytes).toString("hex") === address) {
      transaction = transaction0
    } else if (Buffer.from(transaction1.getSenderAddress().bytes).toString("hex") === address) {
      transaction = transaction1
    } else {
      throw new Error("Signed message does not match address")
    }

    if (transaction.verifySignature()) {
      console.log("Succesfully signed transaction!")
    }

    const transactionHash = await rpcRequest({
      method: "eth_sendRawTransaction",
      params: ["0x" + Buffer.from(transaction.serialize()).toString("hex")],
    })
    console.log("Transaction hash:", transactionHash)
  }

  return (
    <Screen
      preset="auto"
      contentContainerStyle={$screenContentContainer}
      safeAreaEdges={["top", "bottom"]}
    >
      <Text testID="home-title" tx="home.title" preset="heading" style={$title} />
      <Text testID="home-subtitle" tx="home.subtitle" preset="subheading" style={$subtitle} />
      <Text
        testID="home-subtitle"
        text={card?.cardId ?? "Card not set"}
        preset="subheading"
        style={$subtitle}
      />

      <Button
        testID="scan-button"
        tx="home.button.scan"
        style={$tapButton}
        preset="reversed"
        onPress={() => scanCard().catch(console.error)}
      />

      <Button
        testID="sign-button"
        tx="home.button.sign"
        style={$tapButton}
        preset="reversed"
        onPress={
          card
            ? () => signHash(card, 0).catch(console.error)
            : () => console.error("Scan card first")
        }
      />
    </Screen>
  )
})

const $screenContentContainer: ViewStyle = {
  paddingVertical: spacing.xxl,
  paddingHorizontal: spacing.lg,
}

const $title: TextStyle = {
  marginBottom: spacing.sm,
}

const $subtitle: TextStyle = {
  marginBottom: spacing.lg,
}

const $tapButton: ViewStyle = {
  marginTop: spacing.xs,
}
