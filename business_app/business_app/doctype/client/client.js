frappe.ui.form.on("Client", {
	onload_post_render(frm) {
		const debounceDelayMs = 250;
		// - create Awesomplete for ctrl with minChars as argument
		// - add handler for "awesomplete-selectcomplete" that
		// --- selects hint by

		const name_ctrl = frm.get_field("official_name");
		const inn_ctrl = frm.get_field("inn");

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
