import axios from 'axios'

//Shiprocket Bearer Token is valid for 10 days. Needs to be refreshed

const refreshSRToken = async (container, options) => {
  //on startup
  await axios
    .post('https://apiv2.shiprocket.in/v1/external/auth/login', {
      email: options.email,
      password: options.password,
    })
    .then((res) => {
      options.token = res.data.token
    })
    .catch((err) => {
      console.log('Shiprocket token refresh failed')
      throw err
    })

  //Everyday at 12am
  const jobSchedulerService = container.resolve('jobSchedulerService')
  jobSchedulerService.create('refreshSRToken', {}, '0 0 * * *', async () => {
    axios
      .post('https://apiv2.shiprocket.in/v1/external/auth/login', {
        email: options.email,
        password: options.password,
      })
      .then((res) => {
        options.token = res.data.token
      })
      .catch((err) => {
        console.log('Shiprocket token refresh failed')
        throw err
      })
  })
}

export default refreshSRToken
