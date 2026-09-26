import { implement } from '@tenonkit/core/widget'
import Swiper from 'swiper'
import { carousel } from '../../../utils/swiper.ts'
import type { Carousel } from '../widgets.ts'

export default implement<typeof Carousel>(({ el, props, emit }) => {
  const swiper = new Swiper(el, carousel(props.perView))
  swiper.on('slideChange', () => emit('changed', { index: swiper.realIndex }))
  return {
    update(next) {
      swiper.params.slidesPerView = next.perView
      swiper.update()
    },
    destroy: () => swiper.destroy(true, false),
  }
})
