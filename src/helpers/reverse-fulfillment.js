import { humanizeAmount } from 'medusa-core-utils'

async function reverseFulfillment(reverseData) {
  const {
    options,
    client,
    totalsService,
    courier_id,
    fromOrder,
    orderDiscountTotal,
    shipping_address,
    lengthInCM,
    widthInCM,
    heightInCM,
    shipmentWeight,
    pickupLocation: {
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
      name,
      company_id,
      status,
      phone_verified,
    },
    getCountryDisplayName,
  } = reverseData

  let returnShipment = {
    courier_id: courier_id,
    order_id: `${fromOrder.display_id + 'R'}`,
    order_date: new Date().toISOString().split('T')[0],
    channel_id: parseInt(options.channel_id),
    company_name: name,
    pickup_customer_name: shipping_address.first_name,
    pickup_last_name: shipping_address.last_name,
    pickup_address: shipping_address.address_1,
    pickup_address_2: shipping_address.address_2,
    pickup_city: shipping_address.city,
    pickup_state: shipping_address.province,
    pickup_country: getCountryDisplayName(shipping_address.country_code),
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

        const totals = await totalsService.getLineItemTotals(item, fromOrder, {
          include_tax: true,
          use_tax_lines: true,
        })

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
    total_discount: humanizeAmount(orderDiscountTotal, fromOrder.currency_code),
    sub_total: humanizeAmount(
      fromOrder.items.reduce((acc, item) => acc + item.original_total, 0),
      fromOrder.currency_code
    ),
    request_pickup: true,
    length: lengthInCM,
    breadth: widthInCM,
    height: heightInCM,
    weight: shipmentWeight,
  }

  console.log('returnShipment', returnShipment)

  //throw new Error('Not implemented yet')

  const response = await client.wrapper.reverse(returnShipment)

  console.log('Shiprocket: returnShipment response', response)

  return response
}

export default reverseFulfillment
