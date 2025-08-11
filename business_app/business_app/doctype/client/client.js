frappe.ui.form.on("Client", {
	onload_post_render(frm) {
		function addAutocompleteTo(ctrl, fetchSuggestions, minChars, debounceDelayMs) {
			// Attach Awesomplete to the Data field input (Frappe ships it)
			if (!ctrl || !ctrl.$input) return;
			if (!ctrl._awesomplete) {
				console.log("Awecomplete creation...");
				ctrl._awesomplete = new Awesomplete(ctrl.$input.get(0), {
					minChars: minChars,
					list: [],
					replace: function (suggestion) {
						frm.set_value("official_name", suggestion.value.name);
						frm.set_value("inn", suggestion.value.inn);
						frm.set_value("kpp", suggestion.value.kpp);
					},
				});
				console.log("Awecomplete created");

				// Debounced fetch on input
				let timer = null;
				ctrl.$input.on("input", () => {
					console.log("input event");
					const q = (ctrl.$input.val() || "").trim();
					clearTimeout(timer);
					if (q.length < minChars) {
						ctrl._awesomplete.list = [];
						return;
					}
					timer = setTimeout(() => fetchSuggestions(q, ctrl), debounceDelayMs);
				});
			}
		}

		const debounceDelayMs = 250;
		const name_ctrl = frm.get_field("official_name");
		const inn_ctrl = frm.get_field("inn");
		addAutocompleteTo(name_ctrl, fetchSuggestionsByName, 3, debounceDelayMs);
		addAutocompleteTo(inn_ctrl, fetchSuggestionsByInn, 5, debounceDelayMs);
	},
});

function makeFetchSuggestionsFunction(suggestionEndpoint, labelName) {
	return function (query, ctrl) {
		return fetchSuggestions(suggestionEndpoint, labelName, query, ctrl);
	};
}
function fetchSuggestions(suggestionEndpoint, getLabel, query, ctrl) {
	frappe.call({
		method: suggestionEndpoint,
		type: "POST",
		args: { query },
		callback: (r) => {
			const suggestions = (r && r.message && r.message.suggestions) || [];
			ctrl._awesomplete.list = suggestions.map((value) => ({
				label: getLabel(value),
				value: value,
			}));
		},
		error: () => {
			ctrl._awesomplete.list = [];
		},
	});
}

const fetchSuggestionsByName = makeFetchSuggestionsFunction(
	"business_app.api.suggest.by_name",
	(value) => `${value["name"]} (${value["inn"]})`
);
const fetchSuggestionsByInn = makeFetchSuggestionsFunction(
	"business_app.api.suggest.by_inn",
	(value) => `${value["inn"]} (${value["name"]})`
);

frappe.ui.form.on("Client", {
	refresh(frm) {
		update_fill_address_state(frm);
	},
	inn(frm) {
		update_fill_address_state(frm);
	},
	fill_address(frm) {
		if (!has_inn(frm)) {
			return;
		}
		handle_fill_address(frm);
	},
});

function has_inn(frm) {
	return !!(frm.doc.inn || "").trim();
}

function update_fill_address_state(frm) {
	console.log("update_fill_address_state");
	const enable = has_inn(frm);

	// Logical enable/disable
	frm.toggle_enable("fill_address", enable);

	// Visually enable/disable: add/remove .btn-disabled
	const $btn = frm.fields_dict.fill_address.$wrapper.find("button");
	if (enable) {
		$btn.removeClass("btn-disabled");
		$btn.addClass("btn-default");
	} else {
		$btn.removeClass("btn-default");
		$btn.addClass("btn-disabled");
	}
}

async function handle_fill_address(frm) {
	const inn = (frm.doc.inn || "").trim();
	const args = { query: inn };
	const kpp = (frm.doc.kpp || "").trim();
	if (kpp) args.kpp = kpp;

	try {
		const r = await frappe.call({
			method: "business_app.api.company.find_by_id",
			type: "POST",
			args,
		});
		const msg = (r && r.message) || {};
		if (!msg.address) {
			frappe.msgprint({
				title: __("Not found"),
				message: __("Could not find address for the provided INN{0}.", [
					kpp ? " / KPP" : "",
				]),
				indicator: "orange",
			});
			return;
		}
		await frm.set_value("address", msg.address);
		frappe.show_alert({ message: __("Address filled successfuly"), indicator: "green" });

		if (msg.was_searched_without_kpp) {
			frappe.msgprint({
				title: __("Heads up"),
				message: __(
					"Address was searched for the MAIN branch (no KPP match). If the company has multiple branches, please verify."
				),
				indicator: "blue",
			});
		}
	} catch (e) {
		console.error(e);
		frappe.msgprint({
			title: __("Error"),
			message: __("Failed to fetch address. Please try again later."),
			indicator: "red",
		});
	}
}
