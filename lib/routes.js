var Joi = require('joi');
module.exports = [{
	method: 'GET',
	path: '/test/',
	handler: function(request, reply) {
		console.log(request.query);
		reply(request.query.qsid);
	},
	config: {
		validate: {
			query: {
				qsid: Joi.string().required(),

			}
		}
	}
},{
	method: 'GET',
	path: '/testtwo/',
	handler: function(request, reply) {
		reply(request);
	},

}
]