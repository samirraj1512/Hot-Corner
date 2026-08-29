//A spinner component that also works as a timed redirect page after Stripe payment.
import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const Loading = () => {

const {nextUrl} = useParams()
const navigate = useNavigate()

useEffect(()=>{
if(!nextUrl) return undefined;

  const timeoutId = setTimeout(()=>{
    navigate('/'+ nextUrl)
  },9000)

  return () => clearTimeout(timeoutId)
},[navigate, nextUrl])

  return (
    <div className='flex justify-center items-center h-[40vh]'>
        <div className='animate-spin rounded-full h-14 w-14 border-2 border-t-primary'>

        </div>
    </div>
  )
}

export default Loading
