import LojaHeader from './LojaHeader'
import LojaFooter from './LojaFooter'
import HomeHero from './HomeHero'
import HomeBenefits from './HomeBenefits'
import HomeDestaquesServer from './HomeDestaquesServer'

export default function LojaHomePage() {
  return (
    <>
      <LojaHeader />
      <main>
        <HomeHero />
        <HomeBenefits />
        <HomeDestaquesServer />
      </main>
      <LojaFooter />
    </>
  )
}
