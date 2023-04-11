import { countries } from 'medusa-core-utils'
import { FulfillmentService } from 'medusa-interfaces'
import Shiprocket from '../utils/shiprocket'
import {
  forwardFulfillment,
  forwardOrder,
  reverseFulfillment,
  reverseOrder,
  processShipmentData,
} from '../helpers'

class ShiprocketFulfillmentService extends FulfillmentService {
  static identifier = 'shiprocket'

  constructor(
    { logger, totalsService, claimService, swapService, orderService },
    options
  ) {
    super()

    this.options_ = options

    /** @private @const {logger} */
    this.logger_ = logger

    /** @private @const {OrderService} */
    this.orderService_ = orderService

    /** @private @const {TotalsService} */
    this.totalsService_ = totalsService

    /** @private @const {SwapService} */
    this.swapService_ = swapService

    /** @private @const {SwapService} */
    this.claimService_ = claimService

    /** @private @const {AxiosClient} */
    this.client_ = new Shiprocket({
      token: this.options_.token,
    })
  }

  registerInvoiceGenerator(service) {
    if (typeof service.createInvoice === 'function') {
      this.invoiceGenerator_ = service
    }
  }

  getCountryDisplayName(alpha2) {
    const countryObj = countries.find(
      (val) => val.alpha2 === alpha2.toUpperCase()
    )
    return countryObj.name
  }

  async getFulfillmentOptions() {
    return await this.client_.couriers.retrieveAll('active')
  }

  //validate if shipping option still exists and active in Shiprocket before admin adds it to the store
  async validateOption(data) {
    //console.log('validateOption', data)

    const allOpts = await this.client_.couriers.retrieveAll('active')

    //console.log('validateOption', allOpts)

    const selectedOpt = allOpts.find((opt) => opt.id === data.id)

    //console.log('validateOption selectedOpt', selectedOpt)

    return !!selectedOpt
  }

  validateFulfillmentData(optionData, methodData, cartData) {
    // console.log('validateFulfillmentData optionData', optionData)
    // console.log('validateFulfillmentData methodData', methodData)
    // console.log('validateFulfillmentData cartData', cartData)

    return {
      ...optionData,
      ...methodData,
    }
  }

  canCalculate(data) {
    //console.log('canCalculate', data)

    if (this.options_.pricing === 'calculated') {
      return true
    } else {
      return false
    }
  }

  async calculatePrice(optionData, methodData, cartData) {
    //console.log('optionData', optionData)
    //console.log('methodData', methodData)
    //console.log('cartData', cartData)

    if (this.options_.pricing === 'flat_rate') {
      throw Error('Cannot calculate. Pricing strategy is set to flat_rate')
    }

    let shipmentWeight = 0

    cartData.items.forEach((item) => {
      shipmentWeight += item.variant.weight / 1000
    })

    //console.log('shipmentWeight', shipmentWeight)

    const pickupLocations = await this.client_.company.retrieveAll()

    //console.log('pickupLocations', pickupLocations)

    const resp = await this.client_.couriers.getServiceability({
      pickup_postcode: cartData.items[0].is_return
        ? parseInt(pickupLocations.shipping_address[0].pin_code)
        : parseInt(cartData.shipping_address.postal_code),
      delivery_postcode: cartData.items[0].is_return
        ? parseInt(cartData.shipping_address.postal_code)
        : parseInt(pickupLocations.shipping_address[0].pin_code),
      cod: cartData.metadata?.isCOD ? true : false,
      weight: shipmentWeight,
      declared_value: cartData.subtotal / 100,
    })

    //console.log('resp', resp)

    const selOpt = resp.available_courier_companies.filter(
      (opt) => opt.courier_company_id === optionData.id
    )

    //console.log('selOpt', selOpt)

    return selOpt[0].rate * 100 //medusa stores prices in lowest divisible unit i.e. paise
  }

  async createFulfillment(
    methodData,
    fulfillmentItems,
    fromOrder,
    fulfillment
  ) {
    //return Promise.resolve()
    //console.log('methodData', methodData)
    //console.log('fulfillmentItems', fulfillmentItems)
    //console.log('fromOrder', fromOrder)
    //console.log('fulfillment', fulfillment)

    const { billing_address, shipping_address, metadata } = fromOrder

    const {
      isCOD,
      gstin,
      shipment_length,
      shipment_width,
      shipment_height,
      shipment_weight,
    } = metadata

    const { lengthInCM, widthInCM, heightInCM, shipmentWeight } =
      await processShipmentData(
        fulfillmentItems,
        this.options_.length_unit,
        shipment_length,
        shipment_width,
        shipment_height,
        shipment_weight
      )

    const pickupLocations = await this.client_.company.retrieveAll()

    const forwardData = {
      options: this.options_,
      client: this.client_,
      totalsService: this.totalsService_,
      courier_id: methodData.id,
      fulfillmentItems: fulfillmentItems,
      fromOrder: fromOrder,
      billing_address: billing_address,
      shipping_address: shipping_address,
      isCOD: isCOD,
      gstin: gstin,
      lengthInCM: lengthInCM,
      widthInCM: widthInCM,
      heightInCM: heightInCM,
      shipmentWeight: shipmentWeight,
      pickupLocations: pickupLocations,
      getCountryDisplayName: this.getCountryDisplayName,
    }

    if (this.options_.forward_action === 'create_fulfillment') {
      if (
        fromOrder.items.length > 1 &&
        this.options_.multiple_items === 'split_shipment'
      ) {
        //just create order

        console.warn(
          "Shiprocket: It is currently not possible to create fulfillment for multiple split shipments due to limitations in Shiprocket's API. Creating a Shiprocket Order instead"
        )

        return forwardOrder(forwardData)
      } else {
        //create order, request pickup, generate label and manifest

        return forwardFulfillment(forwardData)
      }
    } else {
      //just create an order

      return forwardOrder(forwardData)
    }
  }

  async createReturn(medusaReturn) {
    //console.log('medusaReturn', medusaReturn)

    //throw new Error('Not implemented yet')

    let orderId
    if (medusaReturn.order_id) {
      orderId = medusaReturn.order_id
    } else if (medusaReturn.swap) {
      orderId = medusaReturn.swap.order_id
    } else if (medusaReturn.claim_order) {
      orderId = medusaReturn.claim_order.order_id
    }

    const fromOrder = await this.orderService_.retrieve(orderId, {
      select: ['total'],
      relations: ['discounts', 'discounts.rule', 'shipping_address', 'returns'],
    })

    //console.log('fromOrder', fromOrder)

    //const orderSubtotal = await this.totalsService_.getSubtotal(fromOrder)
    const orderDiscountTotal = await this.totalsService_.getDiscountTotal(
      fromOrder
    )

    const methodData = medusaReturn.shipping_method.data

    const { shipping_address, metadata } = fromOrder

    const {
      shipment_length,
      shipment_width,
      shipment_height,
      shipment_weight,
    } = metadata

    const { lengthInCM, widthInCM, heightInCM, shipmentWeight } =
      await processShipmentData(
        fromOrder.items,
        this.options_.length_unit,
        shipment_length,
        shipment_width,
        shipment_height,
        shipment_weight
      )

    const pickupLocations = await this.client_.company.retrieveAll()

    const reverseData = {
      options: this.options_,
      client: this.client_,
      totalsService: this.totalsService_,
      courier_id: methodData.id,
      fromOrder: fromOrder,
      orderDiscountTotal: orderDiscountTotal,
      shipping_address: shipping_address,
      lengthInCM: lengthInCM,
      widthInCM: widthInCM,
      heightInCM: heightInCM,
      shipmentWeight: shipmentWeight,
      pickupLocation: pickupLocations.shipping_address[0],
      getCountryDisplayName: this.getCountryDisplayName,
    }

    if (this.options_.return_action === 'create_fulfillment') {
      if (
        fromOrder.items.length > 1 &&
        this.options_.multiple_items === 'split_shipment'
      ) {
        //just create an order

        console.warn(
          "Shiprocket: It is currently not possible to create fulfillment for multiple split shipments due to limitations in Shiprocket's API. Creating a Shiprocket Order instead"
        )

        return reverseOrder(reverseData)
      } else {
        //create order, request pickup, generate label and manifest

        return reverseFulfillment(reverseData)
      }
    } else {
      //just create an order

      return reverseOrder(reverseData)
    }
  }

  /**
   * Cancels a fulfillment. If the fulfillment has already been canceled this
   * is idemptotent. Can only cancel pending orders.
   * @param {object} data - the fulfilment data
   * @return {Promise<object>} the result of the cancellation
   */
  async cancelFulfillment(data) {
    //return Promise.resolve()
    //console.log('cancelFulfillment data', data)

    if (!data.shipment_id) {
      console.log('Shiprocket: cancelFulfillment data:', data)
      throw new Error(
        'Shiprocket: Unable to cancel shipment. shipment_id not found in the data received'
      )
    }

    const shipmentDetails = await this.client_.shipments.retrieveById(
      data.shipment_id
    )

    console.log('shipmentDetails', shipmentDetails)

    if (shipmentDetails.status > 5 && shipmentDetails.status !== 11) {
      //shipment has already been shipped, cannot be cancelled
      throw new Error(
        'Shiprocket: Shipment has already been shipped, cannot be cancelled'
      )
    } else {
      const shipmentResponse = await this.client_.orders.cancelShipment({
        awbs: [data.awb_code],
      })

      //console.log('shipmentResponse', shipmentResponse)

      const orderResponse = await this.client_.orders.cancelOrder({
        ids: [data.order_id],
      })

      //console.log('orderResponse', orderResponse)
    }
  }
}

export default ShiprocketFulfillmentService
