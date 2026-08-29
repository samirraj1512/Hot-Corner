import React, { useEffect } from 'react'
import MoviesCard from '../components/MoviesCard'
import BlurCircle from '../components/BlurCircle'
import { useAppContext } from '../context/AppContextCore'


const Movies = () => {

  const {shows}= useAppContext()

useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return shows.length > 0 ?(
    <div className='relative my-40 mb-60 px-6 md:px-16 lg:px-30 overflow-hidden min-h-[80vh]'>
        <h1 className='text-lg font-medium my-4'>Now Showing</h1>
        <BlurCircle top='150px' left='0px'/>
        <BlurCircle bottom='100px' right='50px'/>
        <div className='flex flex-wrap max-sm:justify-center gap-8'>
          {shows.map((movie)=>(
            <MoviesCard movie={movie} key={movie._id}/>
          ))}
        </div>
    </div>
  ) :(
    <div className="flex flex-col items-center justify-center h-screen">
        <h1 className='text-4xl font-bold text-center'>No Movies Available</h1>
    </div>
  )
}

export default Movies
