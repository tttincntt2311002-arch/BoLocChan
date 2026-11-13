function errorCodes(error) {
  return [
    error?.code,
    error?.error?.code,
    error?.info?.error?.code,
    error?.data?.originalError?.code,
  ]
}
export const wasRejected = (error) =>
  errorCodes(error).some((code) => [4001, 'ACTION_REJECTED'].includes(code))

export function errorMessage(error) {
  const codes = errorCodes(error)
  if (wasRejected(error)) return 'Bạn đã từ chối yêu cầu trong MetaMask.'
  if (codes.includes(-32002))
    return 'MetaMask đang chờ bạn xử lý một yêu cầu. Hãy mở ví.'
  if (
    codes.includes('INSUFFICIENT_FUNDS') ||
    /insufficient funds/i.test(error?.message || '')
  )
    return 'Ví không đủ Sepolia ETH để trả gas.'
  if (codes.includes('CALL_EXCEPTION'))
    return 'Giao dịch bị contract từ chối. Kiểm tra quyền Organizer và chứng nhận đã cấp.'
  if (
    codes.some((code) =>
      ['TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR'].includes(code),
    )
  )
    return 'RPC không phản hồi. Giao dịch đã gửi vẫn được giữ để đồng bộ lại.'
  if (error?.response)
    return (
      error.response.data?.error?.message ||
      `Máy chủ trả về lỗi ${error.response.status}.`
    )
  if (error?.isAxiosError)
    return 'Không kết nối được backend. Kiểm tra máy chủ rồi thử lại.'
  return error?.shortMessage || error?.message || 'Không thể hoàn tất yêu cầu.'
}
