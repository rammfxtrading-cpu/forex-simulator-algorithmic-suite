import dynamic from 'next/dynamic'

const SessionPage = dynamic(() => import('./SessionInner'), { ssr: false })

export default function Page() {
  return <SessionPage />
}
