import { humanizeAmount } from 'medusa-core-utils'

async function forwardFulfillment(forwardData) {
  const {
    options,
    client,
    totalsService,
    courier_id,
    fulfillmentItems,
    fromOrder,
    billing_address,
    shipping_address,
    isCOD,
    gstin,
    lengthInCM,
    widthInCM,
    heightInCM,
    shipmentWeight,
    pickupLocations,
    getCountryDisplayName,
  } = forwardData

  let forwardShipment = {
    //"mode": "",
    request_pickup: true,
    print_label: true,
    generate_manifest: true,
    //"ewaybill_no": "",
    courier_id: courier_id,
    //"reseller_name": "",
    order_id: fromOrder.display_id,
    //"isd_code": "",
    //"billing_isd_code": "",
    order_date: new Date().toISOString().split('T')[0],
    channel_id: parseInt(options.channel_id),
    company_name: pickupLocations.shipping_address[0].name,
    billing_customer_name: billing_address.first_name,
    billing_last_name: billing_address.last_name,
    billing_address: billing_address.address_1,
    billing_address_2: billing_address.address_2,
    billing_city: billing_address.city,
    billing_state: billing_address.province,
    billing_country: getCountryDisplayName(
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
    shipping_country: getCountryDisplayName(
      fromOrder.shipping_address.country_code
    ),
    shipping_pincode: parseInt(shipping_address.postal_code),
    shipping_email: fromOrder.email,
    shipping_phone: parseInt(shipping_address.phone),
    order_items: await Promise.all(
      fulfillmentItems.map(async (item) => {
        const totals = await totalsService.getLineItemTotals(item, fromOrder, {
          include_tax: true,
          use_tax_lines: true,
        })

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
    length: lengthInCM,
    breadth: widthInCM,
    height: heightInCM,
    weight: shipmentWeight,
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

  //console.log('forwardShipment', forwardShipment)

  //throw new Error('Not implemented yet')

  const response = await client.wrapper.forward(forwardShipment)

  console.log('Shiprocket: forwardShipment response', response)

  return response
}

export default forwardFulfillment
