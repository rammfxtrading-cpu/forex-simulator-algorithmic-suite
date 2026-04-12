import dynamic from 'next/dynamic'

const SessionInner = dynamic(
  () => import('../../components/SessionInner'),
  { ssr: false, loading: () => null }
)

export default function SessionPage() {
  return <SessionInner />
}

export async function getServerSideProps(context) {
  return { props: { id: context.params.id } }
}
