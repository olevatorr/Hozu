import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'relative h-72 perspective-[900px]',
    spin: 'absolute left-1/2 top-1/2 transform-3d animate-turn',
    top: 'absolute transform-3d transition-transform duration-700 [transform:translateY(-50px)] aria-busy:[transform:translateY(-130px)_rotateZ(-8deg)]',
    peg: 'absolute transform-3d transition-transform duration-700 aria-busy:[transform:translateX(150px)_rotateY(50deg)]',
    bot: 'absolute transform-3d transition-transform duration-700 [transform:translateY(50px)] aria-busy:[transform:translateY(120px)_rotateZ(6deg)]',
  },
})
export const Joint3D = ui.component({
  tag: 'div',
  styles,
  props: z.object({ split: z.boolean() }),
  render: ({ props, classes }) =>
    ui.div({ role: 'img', 'aria-label': 'A tenon joint that splits apart when a change is wrong' }, [
      ui.div({ class: classes.spin }, [
        ui.div({ class: classes.top, 'aria-busy': props.split }, [
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[46px] bg-paper [transform:translate(-50%,-50%)_translateZ(55px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[46px] bg-paper [transform:translate(-50%,-50%)_rotateY(180deg)_translateZ(55px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[110px] h-[46px] bg-sand [transform:translate(-50%,-50%)_rotateY(90deg)_translateZ(75px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[110px] h-[46px] bg-sand [transform:translate(-50%,-50%)_rotateY(-90deg)_translateZ(75px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[110px] bg-ink [transform:translate(-50%,-50%)_rotateX(90deg)_translateZ(23px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[110px] bg-ink [transform:translate(-50%,-50%)_rotateX(-90deg)_translateZ(23px)]',
            },
            [],
          ),
        ]),
        ui.div({ class: classes.peg, 'aria-busy': props.split }, [
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[54px] h-[54px] bg-red [transform:translate(-50%,-50%)_translateZ(75px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[54px] h-[54px] bg-red [transform:translate(-50%,-50%)_rotateY(180deg)_translateZ(75px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[54px] bg-red [transform:translate(-50%,-50%)_rotateY(90deg)_translateZ(27px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[54px] bg-red [transform:translate(-50%,-50%)_rotateY(-90deg)_translateZ(27px)]',
            },
            [],
          ),
        ]),
        ui.div({ class: classes.bot, 'aria-busy': props.split }, [
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[46px] bg-paper [transform:translate(-50%,-50%)_translateZ(55px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[46px] bg-paper [transform:translate(-50%,-50%)_rotateY(180deg)_translateZ(55px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[110px] h-[46px] bg-sand [transform:translate(-50%,-50%)_rotateY(90deg)_translateZ(75px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[110px] h-[46px] bg-sand [transform:translate(-50%,-50%)_rotateY(-90deg)_translateZ(75px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[110px] bg-ink [transform:translate(-50%,-50%)_rotateX(90deg)_translateZ(23px)]',
            },
            [],
          ),
          ui.i(
            {
              class:
                'absolute left-0 top-0 border-4 border-ink w-[150px] h-[110px] bg-ink [transform:translate(-50%,-50%)_rotateX(-90deg)_translateZ(23px)]',
            },
            [],
          ),
        ]),
      ]),
    ]),
})
