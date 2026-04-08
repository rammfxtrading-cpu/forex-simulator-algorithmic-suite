import '../styles/globals.css'
import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return <>
    <Head>
      <title>Forex Simulator — by Algorithmic Suite</title>
      <link rel="icon" href="/favicon.ico" />
    </Head>
    <Component {...pageProps} />
  </>
}
