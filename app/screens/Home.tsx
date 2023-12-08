import { observer } from "mobx-react-lite"
import React, { FC, useState } from "react"
import { TextStyle, ViewStyle } from "react-native"
import { Button, Screen, Text } from "../components"
import { AppStackScreenProps } from "../navigators"
import { spacing } from "../theme"
import TangemSdk, { Card } from "tangem-sdk-react-native"
import { FeeMarketEIP1559Transaction } from "@ethereumjs/tx"
import { Buffer } from "@craftzdog/react-native-buffer"

interface HomeProps extends AppStackScreenProps<"Home"> {}

export const Home: FC<HomeProps> = observer(function Home(_props) {
  const [card, setCard] = useState<Card | undefined>()

  TangemSdk.startSession({})
  async function scanCard() {
    const scannedCard = await TangemSdk.scanCard()
    setCard(scannedCard)
  }

  async function signHash(withCard: Card) {
    const transactionData = {
      chainId: BigInt(1),
      to: "0x2309762aAcA0a8F689463a42c0A6A84BE3A7ea51",
      value: BigInt(0),
      data: "0x",
      gasLimit: BigInt(21000),
    }
    const transactionSettings = {
      nonce: BigInt(0),
      maxFeePerGas: BigInt(0),
      maxPriorityFeePerGas: BigInt(0),
      type: "0x02",
    }

    const unsignedTransaction = FeeMarketEIP1559Transaction.fromTxData({
      // https://github.com/ethereumjs/ethereumjs-monorepo/blob/master/packages/tx/src/eip1559Transaction.ts
      chainId: transactionData.chainId,
      to: transactionData.to,
      value: transactionData.value,
      data: transactionData.data,
      gasLimit: transactionData.gasLimit,
      nonce: transactionSettings.nonce,
      maxFeePerGas: transactionSettings.maxFeePerGas,
      maxPriorityFeePerGas: transactionSettings.maxPriorityFeePerGas,
      type: transactionSettings.type,
    })
    const toSign = Buffer.from(unsignedTransaction.getMessageToSign()).toString("hex")

    const tangemSign = await TangemSdk.sign({
      // Tangem React Native SDK doesnt support signing a single hash
      hashes: [toSign, toSign] as any as [string], // mistake in the Tangem SDK ? Should be string[] ?
      cardId: withCard.cardId,
      walletPublicKey: withCard.wallets[0].publicKey,
    })
    const signature = tangemSign.signatures[0]
    const recovery = BigInt(0) // Tangem card doesnt return this value ?

    const transaction = FeeMarketEIP1559Transaction.fromTxData({
      // https://github.com/ethereumjs/ethereumjs-monorepo/blob/master/packages/util/src/signature.ts
      ...unsignedTransaction,
      v: recovery, // + transactionData.chainId * BigInt(2) + BigInt(35),
      r: BigInt("0x" + signature.substring(0, 64)),
      s: BigInt("0x" + signature.substring(64, 128)),
    })

    console.log(transaction.verifySignature())
    console.log(transaction.getValidationErrors())
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
          card ? () => signHash(card).catch(console.error) : () => console.error("Scan card first")
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
