import { humanizeAmount, countries } from 'medusa-core-utils'
import { FulfillmentService } from 'medusa-interfaces'
import Shiprocket from '../utils/shiprocket'

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
    console.log('validateOption', data)

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

    let lengthInCM, widthInCM, heightInCM

    let sumOfWeights = 0

    let largestItem

    if (
      shipment_length &&
      shipment_width &&
      shipment_height &&
      shipment_weight
    ) {
      switch (this.options_.length_unit) {
        case 'mm':
          lengthInCM = shipment_length / 10
          widthInCM = shipment_width / 10
          heightInCM = shipment_height / 10
          break
        case 'cm':
          lengthInCM = shipment_length
          widthInCM = shipment_width
          heightInCM = shipment_height
          break
        case 'inches':
          lengthInCM = shipment_length * 2.54
          widthInCM = shipment_width * 2.54
          heightInCM = shipment_height * 2.54
          break
        default:
          throw new Error(
            'Shiprocket: Please add a length_unit. Supported values are mm, cm, inches'
          )
      }
    } else {
      let volWeights = {}

      fulfillmentItems.forEach((item) => {
        const { length, width, height, weight } = item.variant

        sumOfWeights += weight / 1000 //Shiprocket requires weight in KGS

        let volWeight

        switch (this.options_.length_unit) {
          case 'mm':
            volWeight = (length * width * height) / (5000 * 1000)
            break
          case 'cm':
            volWeight = (length * width * height) / 5000
            break
          case 'inches':
            volWeight = (length * width * height * 16.387064) / 5000
            break
          default:
            throw new Error(
              'Shiprocket: Please add a length_unit. Supported values are mm, cm, inches'
            )
        }

        volWeights[item.id] = volWeight
      })

      const largestItemId = Object.keys(volWeights).reduce((a, b) =>
        volWeights[a] > volWeights[b] ? a : b
      )

      largestItem = fulfillmentItems.find((item) => item.id === largestItemId)
    }

    const pickupLocations = await this.client_.company.retrieveAll()

    if (this.options_.forward_action === 'create_fulfillment') {
      //create order, request pickup, generate label and manifest

      if (
        fromOrder.items.length > 1 &&
        this.options_.multiple_items === 'split_shipment'
      ) {
        throw new Error(
          "Shiprocket doesn't support creating split shipments via it's API. Use forward_action:'create_order' or multiple_items:'single_shipment'"
        )
      }

      let forwardShipment = {
        //"mode": "",
        request_pickup: true,
        print_label: true,
        generate_manifest: true,
        //"ewaybill_no": "",
        courier_id: methodData.id,
        //"reseller_name": "",
        order_id: fromOrder.display_id,
        //"isd_code": "",
        //"billing_isd_code": "",
        order_date: new Date().toISOString().split('T')[0],
        channel_id: parseInt(this.options_.channel_id),
        company_name: pickupLocations.shipping_address[0].name,
        billing_customer_name: billing_address.first_name,
        billing_last_name: billing_address.last_name,
        billing_address: billing_address.address_1,
        billing_address_2: billing_address.address_2,
        billing_city: billing_address.city,
        billing_state: billing_address.province,
        billing_country: this.getCountryDisplayName(
          fromOrder.billing_address.country_code
        ),
        billing_pincode: parseInt(billing_address.postal_code),
        billing_email: fromOrder.email,
        billing_phone: parseInt(billing_address.phone),
        //billing_alternate_phone: '',
        shipping_is_billing: false, //medusa does not store shipping_is_billing?
        shipping_customer_name: shipping_address.first_name,
        shipping_last_name: shipping_address.last_name,
        shipping_address: shipping_address.address_1,
        shipping_address_2: shipping_address.address_2,
        shipping_city: shipping_address.city,
        shipping_state: shipping_address.province,
        shipping_country: this.getCountryDisplayName(
          fromOrder.shipping_address.country_code
        ),
        shipping_pincode: parseInt(shipping_address.postal_code),
        shipping_email: fromOrder.email,
        shipping_phone: parseInt(shipping_address.phone),
        order_items: await Promise.all(
          fulfillmentItems.map(async (item) => {
            const totals = await this.totalsService_.getLineItemTotals(
              item,
              fromOrder,
              {
                include_tax: true,
                use_tax_lines: true,
              }
            )

            //console.log(`totals for ${item.title}`, totals)

            return {
              name: item.title,
              sku: item.variant.sku,
              units: item.quantity,
              hsn: parseInt(item.variant.hs_code),
              selling_price: humanizeAmount(
                totals.original_total,
                fromOrder.currency_code
              ),
              tax: totals.tax_lines.reduce((acc, next) => acc + next.rate, 0),
              // discount: humanizeAmount(
              //   totals.discount_total,
              //   fromOrder.currency_code
              // ),
            }
          })
        ),
        payment_method: !!isCOD ? 'COD' : 'Prepaid',
        shipping_charges: humanizeAmount(
          fromOrder.shipping_methods[0].price,
          fromOrder.currency_code
        ),
        //giftwrap_charges: '',
        //transaction_charges: '',
        total_discount: humanizeAmount(
          fromOrder.discount_total,
          fromOrder.currency_code
        ),
        sub_total: humanizeAmount(
          fromOrder.items.reduce((acc, item) => acc + item.original_total, 0),
          fromOrder.currency_code
        ),
        pickup_location: pickupLocations.shipping_address[0].pickup_location,
        //   vendor_details: {
        //     email: '',
        //     phone: '',
        //     name: '',
        //     address: '',
        //     address_2: '',
        //     city: '',
        //     state: '',
        //     country: '',
        //     pin_code: '',
        //     pickup_location: '',
        //   },
        //order_type:"",
        //longitude:"",
        //latitude:""
      }

      if (gstin) {
        forwardShipment.customer_gstin = gstin
      }

      if (
        shipment_length &&
        shipment_width &&
        shipment_height &&
        shipment_weight
      ) {
        forwardShipment.length = lengthInCM
        forwardShipment.breadth = widthInCM
        forwardShipment.height = heightInCM
        forwardShipment.weight = shipment_weight
      } else {
        console.log(
          "Shiprocket: Item dimensions and weight not found in order's metadata. Using largest item's dimensions and sum of weights to create forwardShipment"
        )
        forwardShipment.length = largestItem.variant.length
        forwardShipment.breadth = largestItem.variant.width
        forwardShipment.height = largestItem.variant.height
        forwardShipment.weight = sumOfWeights
      }

      //console.log('forwardShipment', forwardShipment)

      //throw new Error('Not implemented yet')

      const response = await this.client_.wrapper.forward(forwardShipment)

      console.log('forwardShipment response', response)

      return response
    } else {
      //just create an order

      let newOrder = {
        order_id: fromOrder.display_id,
        order_date: new Date().toISOString().split('T')[0],
        pickup_location: pickupLocations.shipping_address[0].pickup_location,
        channel_id: parseInt(this.options_.channel_id),
        //comment:"",
        billing_customer_name: billing_address.first_name,
        billing_last_name: billing_address.last_name,
        billing_address: billing_address.address_1,
        billing_address_2: billing_address.address_2,
        billing_city: billing_address.city,
        billing_state: billing_address.province,
        billing_country: this.getCountryDisplayName(
          fromOrder.billing_address.country_code
        ),
        billing_pincode: parseInt(billing_address.postal_code),
        billing_email: fromOrder.email,
        billing_phone: parseInt(billing_address.phone),
        shipping_is_billing: false, //medusa does not store shipping_is_billing?
        shipping_customer_name: shipping_address.first_name,
        shipping_last_name: shipping_address.last_name,
        shipping_address: shipping_address.address_1,
        shipping_address_2: shipping_address.address_2,
        shipping_city: shipping_address.city,
        shipping_state: shipping_address.province,
        shipping_country: this.getCountryDisplayName(
          fromOrder.shipping_address.country_code
        ),
        shipping_pincode: parseInt(shipping_address.postal_code),
        shipping_email: fromOrder.email,
        shipping_phone: parseInt(shipping_address.phone),
        order_items: await Promise.all(
          fulfillmentItems.map(async (item) => {
            const totals = await this.totalsService_.getLineItemTotals(
              item,
              fromOrder,
              {
                include_tax: true,
                use_tax_lines: true,
              }
            )
            //console.log(`totals for ${item.title}`, totals)

            return {
              name: item.title,
              sku: item.variant.sku,
              units: item.quantity,
              selling_price: humanizeAmount(
                totals.original_total,
                fromOrder.currency_code
              ),
              // discount: humanizeAmount(
              //   totals.discount_total,
              //   fromOrder.currency_code
              // ),
              tax: totals.tax_lines.reduce((acc, next) => acc + next.rate, 0),
              hsn: parseInt(item.variant.hs_code),
            }
          })
        ),
        payment_method: !!isCOD ? 'COD' : 'Prepaid',
        shipping_charges: humanizeAmount(
          fromOrder.shipping_methods[0].price,
          fromOrder.currency_code
        ),
        //giftwrap_charges: '',
        //transaction_charges: '',
        total_discount: humanizeAmount(
          fromOrder.discount_total,
          fromOrder.currency_code
        ),
        sub_total: humanizeAmount(
          fromOrder.items.reduce((acc, item) => acc + item.original_total, 0),
          fromOrder.currency_code
        ),
        //ewaybill_no: "",
        //invoice_number: "",
        //order_type: "",
        //checkout_shipping_method:""
      }

      if (gstin) {
        forwardShipment.customer_gstin = gstin
      }

      if (
        shipment_length &&
        shipment_width &&
        shipment_height &&
        shipment_weight
      ) {
        newOrder.length = lengthInCM
        newOrder.breadth = widthInCM
        newOrder.height = heightInCM
        newOrder.weight = shipment_weight
      } else {
        console.log(
          "Shiprocket: Item dimensions and weight not found in order's metadata. Using largest item's dimensions and sum of weights to create newOrder"
        )
        newOrder.length = largestItem.variant.length
        newOrder.breadth = largestItem.variant.width
        newOrder.height = largestItem.variant.height
        newOrder.weight = sumOfWeights
      }

      //console.log('newOrder', newOrder)

      //throw new Error('Not implemented yet')

      let response

      if (this.options_.inventory_sync) {
        response = await this.client_.orders.createForChannel(newOrder)
      } else {
        response = await this.client_.orders.createCustom(newOrder)
      }

      console.log('newOrder response', response)

      return response
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
      isCOD,
      gstin,
      shipment_length,
      shipment_width,
      shipment_height,
      shipment_weight,
    } = metadata

    let lengthInCM, widthInCM, heightInCM

    let sumOfWeights = 0

    let largestItem

    if (
      shipment_length &&
      shipment_width &&
      shipment_height &&
      shipment_weight
    ) {
      switch (this.options_.length_unit) {
        case 'mm':
          lengthInCM = shipment_length / 10
          widthInCM = shipment_width / 10
          heightInCM = shipment_height / 10
          break
        case 'cm':
          lengthInCM = shipment_length
          widthInCM = shipment_width
          heightInCM = shipment_height
          break
        case 'inches':
          lengthInCM = shipment_length * 2.54
          widthInCM = shipment_width * 2.54
          heightInCM = shipment_height * 2.54
          break
        default:
          throw new Error(
            'Shiprocket: Please add a length_unit. Supported values are mm, cm, inches'
          )
      }
    } else {
      let volWeights = {}

      fromOrder.items.forEach((item) => {
        const { length, width, height, weight } = item.variant

        sumOfWeights += weight / 1000 //Shiprocket requires weight in KGS

        let volWeight

        switch (this.options_.length_unit) {
          case 'mm':
            volWeight = (length * width * height) / (5000 * 1000)
            break
          case 'cm':
            volWeight = (length * width * height) / 5000
            break
          case 'inches':
            volWeight = (length * width * height * 16.387064) / 5000
            break
          default:
            throw new Error(
              'Shiprocket: Please add a length_unit. Supported values are mm, cm, inches'
            )
        }

        volWeights[item.id] = volWeight
      })

      const largestItemId = Object.keys(volWeights).reduce((a, b) =>
        volWeights[a] > volWeights[b] ? a : b
      )

      largestItem = fromOrder.items.find((item) => item.id === largestItemId)
    }

    const pickupLocations = await this.client_.company.retrieveAll()

    const {
      id,
      pickup_location,
      address,
      address_2,
      city,
      state,
      country,
      pin_code,
      email,
      phone,
      name:company_name,
      company_id,
      status,
      phone_verified,
    } = pickupLocations.shipping_address[0]

    if (this.options_.return_action === 'create_fulfillment') {
      //create order, request pickup, generate label and manifest

      if (
        fromOrder.items.length > 1 &&
        this.options_.multiple_items === 'split_shipment'
      ) {
        throw new Error(
          "Shiprocket doesn't support creating split shipments via it's API. Use return_action:'create_order' or multiple_items:'single_shipment'"
        )
      }

      let returnShipment = {
        courier_id: methodData.id, //?
        order_id: `${fromOrder.display_id + 'R'}`,
        order_date: new Date().toISOString().split('T')[0],
        channel_id: parseInt(this.options_.channel_id),
        company_name: company_name,
        pickup_customer_name: shipping_address.first_name,
        pickup_last_name: shipping_address.last_name,
        pickup_address: shipping_address.address_1,
        pickup_address_2: shipping_address.address_2,
        pickup_city: shipping_address.city,
        pickup_state: shipping_address.province,
        pickup_country: this.getCountryDisplayName(
          shipping_address.country_code
        ),
        pickup_pincode: parseInt(shipping_address.postal_code),
        pickup_email: fromOrder.email,
        pickup_phone: parseInt(shipping_address.phone),
        //pickup_isd_code:
        shipping_customer_name: name,
        //shipping_last_name:
        shipping_address: address,
        shipping_address_2: address_2,
        shipping_city: city,
        shipping_state: state,
        shipping_country: country,
        shipping_pincode: parseInt(pin_code),
        shipping_email: email,
        //shipping_isd_code
        shipping_phone: parseInt(phone),
        order_items: await Promise.all(
          fromOrder.items.map(async (item) => {
            const {
              qc_enable,
              qc_color,
              qc_brand,
              qc_serial_no,
              qc_ean_barcode,
              qc_size,
              qc_product_name,
              qc_product_image,
            } = item.metadata

            const totals = await this.totalsService_.getLineItemTotals(
              item,
              fromOrder,
              {
                include_tax: true,
                use_tax_lines: true,
              }
            )

            //console.log(`totals for ${item.title}`, totals)

            let itemDetails = {
              name: item.title,
              sku: item.variant.sku,
              units: item.quantity,
              hsn: parseInt(item.variant.hs_code),
              selling_price: humanizeAmount(
                totals.original_total,
                fromOrder.currency_code
              ),
              tax: totals.tax_lines.reduce((acc, next) => acc + next.rate, 0),
              // discount: humanizeAmount(
              //   totals.discount_total,
              //   fromOrder.currency_code
              // ),
            }

            if (qc_enable) {
              itemDetails.qc_enable = true

              if (qc_color) {
                itemDetails.qc_color = qc_color
              }

              if (qc_brand) {
                itemDetails.qc_brand = qc_brand
              }

              if (qc_serial_no) {
                itemDetails.qc_serial_no = qc_serial_no
              }

              if (qc_ean_barcode) {
                itemDetails.qc_ean_barcode = qc_ean_barcode
              }

              if (qc_size) {
                itemDetails.qc_size = qc_size
              }

              if (qc_product_name) {
                itemDetails.qc_product_name = qc_product_name
              }

              if (qc_product_image) {
                itemDetails.qc_product_image = qc_product_image
              }
            }

            return itemDetails
          })
        ),
        payment_method: 'prepaid', //Returns will never be COD
        total_discount: humanizeAmount(
          orderDiscountTotal,
          fromOrder.currency_code
        ),
        sub_total: humanizeAmount(
          fromOrder.items.reduce((acc, item) => acc + item.original_total, 0),
          fromOrder.currency_code
        ),
        request_pickup: true,
      }

      if (
        shipment_length &&
        shipment_width &&
        shipment_height &&
        shipment_weight
      ) {
        returnShipment.length = lengthInCM
        returnShipment.breadth = widthInCM
        returnShipment.height = heightInCM
        returnShipment.weight = shipment_weight
      } else {
        console.log(
          "Shiprocket: Item dimensions and weight not found in order's metadata. Using largest item's dimensions and sum of weights to create returnShipment"
        )
        returnShipment.length = largestItem.variant.length
        returnShipment.breadth = largestItem.variant.width
        returnShipment.height = largestItem.variant.height
        returnShipment.weight = sumOfWeights
      }

      //console.log('returnShipment', returnShipment)

      //throw new Error('Not implemented yet')

      const response = await this.client_.wrapper.reverse(returnShipment)

      console.log('returnShipment response', response)

      return response
    } else {
      //just create an order
      let returnOrder = {
        order_id: `${fromOrder.display_id + 'R'}`,
        order_date: new Date().toISOString().split('T')[0],
        channel_id: parseInt(this.options_.channel_id),
        company_name: company_name,
        pickup_customer_name: shipping_address.first_name,
        pickup_last_name: shipping_address.last_name,
        pickup_address: shipping_address.address_1,
        pickup_address_2: shipping_address.address_2,
        pickup_city: shipping_address.city,
        pickup_state: shipping_address.province,
        pickup_country: this.getCountryDisplayName(
          shipping_address.country_code
        ),
        pickup_pincode: parseInt(shipping_address.postal_code),
        pickup_email: fromOrder.email,
        pickup_phone: parseInt(shipping_address.phone),
        //pickup_isd_code:
        shipping_customer_name: name,
        //shipping_last_name:
        shipping_address: address,
        shipping_address_2: address_2,
        shipping_city: city,
        shipping_state: state,
        shipping_country: country,
        shipping_pincode: parseInt(pin_code),
        shipping_email: email,
        //shipping_isd_code
        shipping_phone: parseInt(phone),
        order_items: await Promise.all(
          fromOrder.items.map(async (item) => {
            const {
              qc_enable,
              qc_color,
              qc_brand,
              qc_serial_no,
              qc_ean_barcode,
              qc_size,
              qc_product_name,
              qc_product_image,
            } = item.metadata

            const totals = await this.totalsService_.getLineItemTotals(
              item,
              fromOrder,
              {
                include_tax: true,
                use_tax_lines: true,
              }
            )

            //console.log(`totals for ${item.title}`, totals)

            let itemDetails = {
              name: item.title,
              sku: item.variant.sku,
              units: item.quantity,
              hsn: parseInt(item.variant.hs_code),
              selling_price: humanizeAmount(
                totals.original_total,
                fromOrder.currency_code
              ),
              tax: totals.tax_lines.reduce((acc, next) => acc + next.rate, 0),
              // discount: humanizeAmount(
              //   totals.discount_total,
              //   fromOrder.currency_code
              // ),
            }

            if (qc_enable) {
              itemDetails.qc_enable = true

              if (qc_color) {
                itemDetails.qc_color = qc_color
              }

              if (qc_brand) {
                itemDetails.qc_brand = qc_brand
              }

              if (qc_serial_no) {
                itemDetails.qc_serial_no = qc_serial_no
              }

              if (qc_ean_barcode) {
                itemDetails.qc_ean_barcode = qc_ean_barcode
              }

              if (qc_size) {
                itemDetails.qc_size = qc_size
              }

              if (qc_product_name) {
                itemDetails.qc_product_name = qc_product_name
              }

              if (qc_product_image) {
                itemDetails.qc_product_image = qc_product_image
              }
            }

            return itemDetails
          })
        ),
        payment_method: 'prepaid', //Returns will never be COD
        total_discount: humanizeAmount(
          orderDiscountTotal,
          fromOrder.currency_code
        ),
        sub_total: humanizeAmount(
          fromOrder.items.reduce((acc, item) => acc + item.original_total, 0),
          fromOrder.currency_code
        ),
      }

      if (
        shipment_length &&
        shipment_width &&
        shipment_height &&
        shipment_weight
      ) {
        returnOrder.length = lengthInCM
        returnOrder.breadth = widthInCM
        returnOrder.height = heightInCM
        returnOrder.weight = shipment_weight
      } else {
        console.log(
          "Shiprocket: Item dimensions and weight not found in order's metadata. Using largest item's dimensions and sum of weights to create returnOrder"
        )
        returnOrder.length = largestItem.variant.length
        returnOrder.breadth = largestItem.variant.width
        returnOrder.height = largestItem.variant.height
        returnOrder.weight = sumOfWeights
      }

      //console.log('returnOrder', returnOrder)

      //throw new Error('Not implemented yet')

      const response = await this.client_.returns.createReturn(returnOrder)

      console.log('returnOrder response', response)

      return response
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

    //console.log('shipmentDetails', shipmentDetails)

    if (shipmentDetails.status > 5) {
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
