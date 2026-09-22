import '../styles/globals.css'
import Head from 'next/head'
import Fps from '../components/Fps'

export default function App({ Component, pageProps }) {
  return <>
    <Head>
      <title>Forex Simulator — by Algorithmic Suite</title>
      <link rel="icon" href="/favicon.ico" />
    </Head>
    <Component {...pageProps} />
    {/* Medidor de fps: solo existe con ?fps=1. Ver components/Fps.js */}
    <Fps />
  </>
}
