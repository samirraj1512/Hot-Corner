import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactPlayer from 'react-player'
import BlurCircle from './BlurCircle'
import { PlayCircleIcon } from 'lucide-react'
import { useAppContext } from '../context/AppContextCore'

const TrailersSection = () => {
  const { axios } = useAppContext()
  const [trailers, setTrailers] = useState([])
  const [currentTrailer, setCurrentTrailer] = useState(null)
  const trailerRailRef = useRef(null)

  const fetchTrailers = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/show/upcoming-trailers')
      if (data.success) {
        setTrailers(data.trailers)
        setCurrentTrailer(data.trailers[0] || null)
      }
    } catch (error) {
      console.error(error)
    }
  }, [axios])

  useEffect(() => {
    fetchTrailers()
  }, [fetchTrailers])

  const handleTrailerRailWheel = useCallback((event) => {
    const rail = trailerRailRef.current
    if (!rail || rail.scrollWidth <= rail.clientWidth) return

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY
    if (!delta) return

    event.preventDefault()
    rail.scrollBy({ left: delta, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const rail = trailerRailRef.current
    if (!rail) return undefined

    rail.addEventListener('wheel', handleTrailerRailWheel, { passive: false })
    return () => rail.removeEventListener('wheel', handleTrailerRailWheel)
  }, [handleTrailerRailWheel, trailers.length])

  if (!currentTrailer) return null

  return (
    <div className='px-6 md:px-16 lg:px-24 xl:px-44 py-20 overflow-hidden'>
      <p className='text-gray-300 font-medium text-lg max-w-[960px]'>Upcoming Trailers</p>

      <div className='relative mt-6 aspect-video w-full max-w-[1960px] mx-auto border-4 border-orange-500 rounded-xl overflow-hidden'>
        <BlurCircle top='-10px' right='-100px' />
        <ReactPlayer
          url={currentTrailer.videoUrl}
          controls
          width='100%'
          height='100%'
          className='absolute top-0 left-0'
        />
      </div>

      <div
        ref={trailerRailRef}
        className='trailer-rail mt-8 max-w-3xl mx-auto overflow-x-auto overflow-y-hidden overscroll-contain snap-x snap-mandatory scroll-smooth pb-4'
        aria-label='Upcoming trailers'
      >
        <div className='flex w-max gap-4 px-1 sm:gap-5'>
          {trailers.map((trailer) => {
            const selected = currentTrailer.videoUrl === trailer.videoUrl

            return (
              <button
                key={trailer.videoUrl}
                type='button'
                aria-pressed={selected}
                className={`group relative w-40 shrink-0 snap-start text-left transition duration-300 cursor-pointer sm:w-44 md:w-48 ${selected ? 'opacity-100' : 'opacity-75 hover:opacity-100'} hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary`}
                onClick={() => setCurrentTrailer(trailer)}
              >
                <div className={`relative aspect-video overflow-hidden rounded-lg border transition ${selected ? 'border-primary' : 'border-transparent group-hover:border-primary/60'}`}>
                  <img src={trailer.image} alt={trailer.title} className='h-full w-full object-cover brightness-75 transition duration-300 group-hover:scale-105 group-hover:brightness-90' />
                  <PlayCircleIcon strokeWidth={1.6} className='absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-primary drop-shadow-md transition group-hover:scale-110' />
                </div>
                <p className='mt-2 truncate text-sm text-gray-300'>{trailer.title}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TrailersSection
