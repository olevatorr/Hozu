import type { SwiperOptions } from 'swiper/types'

export const carousel = (perView: number): SwiperOptions => ({
  slidesPerView: 1.15,
  spaceBetween: 16,
  grabCursor: true,
  breakpoints: { 768: { slidesPerView: perView, spaceBetween: 24 } },
})
