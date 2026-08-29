import React, { useCallback, useEffect, useState } from 'react'
import Loading from '../../components/Loading'
import Title from '../../components/admin/Title'
import { useAppContext } from '../../context/AppContextCore'

const formatTimeSpent = (seconds = 0) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const formatUserDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

const ListUsers = () => {
  const { axios, getToken, user } = useAppContext()
  const currency = import.meta.env.VITE_CURRENCY
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const getAllUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      setError('')
      const { data } = await axios.get('/api/admin/all-users', {
        headers: { Authorization: `Bearer ${await getToken()}` },
      })

      if (data.success) {
        setUsers(data.users)
      } else {
        throw new Error(data.message || 'Could not load users')
      }
    } catch (error) {
      console.error(error)
      setError(error.response?.data?.message || error.message || 'Could not load users')
    } finally {
      setIsLoading(false)
    }
  }, [axios, getToken])

  useEffect(() => {
    if (user) getAllUsers()
  }, [getAllUsers, user])

  return !isLoading ? (
    <>
      <Title text1='List' text2='Users' />
      {error ? (
        <div className='mt-6 flex flex-wrap items-center justify-between gap-3 border border-red-300/25 bg-red-300/10 px-4 py-3 rounded-md text-sm text-red-100'>
          <p>{error}</p>
          <button onClick={getAllUsers} className='h-9 px-3 border border-red-200/30 hover:bg-red-200/10 rounded-md cursor-pointer'>Retry</button>
        </div>
      ) : (
      <div className='max-w-6xl mt-6 overflow-x-auto'>
        <table className='w-full border-collapse rounded-md overflow-hidden text-nowrap'>
          <thead>
            <tr className='bg-primary/50 text-left text-white'>
              <th className='p-2 font-medium pl-5'>User ID</th>
              <th className='p-2 font-medium pl-5'>Name</th>
              <th className='p-2 font-medium pl-5'>Phone</th>
              <th className='p-2 font-medium pl-5'>Gmail</th>
              <th className='p-2 font-medium pl-5'>Total Paid</th>
              <th className='p-2 font-medium pl-5'>Time Spent</th>
              <th className='p-2 font-medium pl-5'>Joined</th>
            </tr>
          </thead>
          <tbody className='text-sm font-light'>
            {users.map((item) => (
              <tr key={item._id} className='border-b border-primary/20 bg-primary-dull/15 even:bg-primary/20'>
                <td className='p-2 max-w-52 truncate pl-5'>{item._id}</td>
                <td className='p-2 min-w-40 pl-5'>{item.name}</td>
                <td className='p-2 min-w-36 pl-5'>{item.phone || 'No phone'}</td>
                <td className='p-2 min-w-56 pl-5'>{item.email}</td>
                <td className='p-2 pl-5'>{currency}{item.totalPaid}</td>
                <td className='p-2 pl-5'>{formatTimeSpent(item.totalTimeSpent)}</td>
                <td className='p-2 pl-5'>{formatUserDate(item.createdAt)}</td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan='7' className='p-10 text-center text-gray-400'>There are no registered users yet.</td></tr>}
          </tbody>
        </table>
      </div>
      )}
    </>
  ) : (
    <Loading />
  )
}

export default ListUsers
